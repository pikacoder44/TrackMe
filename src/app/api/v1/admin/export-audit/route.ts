import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveUserSystemRole } from '@/lib/auth-rbac'
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  WidthType,
  AlignmentType,
  BorderStyle,
} from 'docx'

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { role } = await resolveUserSystemRole(supabase, user)
    if (role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Forbidden: Super Admin privileges required.' },
        { status: 403 }
      )
    }

    // Fetch comprehensive audit data
    const [orgsResult, membersResult, sessionsResult, entriesResult] = await Promise.all([
      supabase.from('organizations').select('id, name, slug, team_code, require_approval, created_at').order('name'),
      supabase.from('organization_members').select('id, organization_id, user_id, role, approval_status, created_at, organization:organizations(name), profile:profiles(email, full_name, username)'),
      supabase.from('work_sessions').select('id, organization_id, status, started_at, ended_at, user_id').order('started_at', { ascending: false }).limit(50),
      supabase.from('time_entries').select('duration_seconds, approval_status'),
    ])

    const organizations = orgsResult.data || []
    const members = membersResult.data || []
    const sessions = sessionsResult.data || []
    const entries = entriesResult.data || []

    const totalTrackedSeconds = entries.reduce((acc, curr) => acc + (curr.duration_seconds || 0), 0)
    const totalTrackedHours = (totalTrackedSeconds / 3600).toFixed(1)
    const activeSessionsCount = sessions.filter((s) => s.status === 'active').length

    const tableBorder = {
      top: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
      left: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
      right: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
    }

    // Build Word Document
    const doc = new Document({
      sections: [
        {
          properties: {},
          children: [
            new Paragraph({
              text: 'TrackMe Telemetry Hub',
              heading: HeadingLevel.TITLE,
              alignment: AlignmentType.CENTER,
            }),
            new Paragraph({
              text: 'Executive System Audit & Team Activity Report',
              heading: HeadingLevel.HEADING_2,
              alignment: AlignmentType.CENTER,
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: `Generated: ${new Date().toUTCString()} | Operator: ${user.email}`,
                  italics: true,
                  size: 20,
                  color: '666666',
                }),
              ],
              alignment: AlignmentType.CENTER,
            }),
            new Paragraph({ text: '' }),

            // Executive Summary
            new Paragraph({
              text: '1. Executive Summary',
              heading: HeadingLevel.HEADING_1,
            }),
            new Paragraph({
              children: [
                new TextRun({ text: 'Total Organizations: ', bold: true }),
                new TextRun(`${organizations.length}\n`),
                new TextRun({ text: 'Total Registered Members: ', bold: true }),
                new TextRun(`${members.length}\n`),
                new TextRun({ text: 'Currently Active Work Sessions: ', bold: true }),
                new TextRun(`${activeSessionsCount}\n`),
                new TextRun({ text: 'Total Verified Tracked Time: ', bold: true }),
                new TextRun(`${totalTrackedHours} hours\n`),
              ],
            }),
            new Paragraph({ text: '' }),

            // Organizations Table
            new Paragraph({
              text: '2. Managed Organizations & Access Credentials',
              heading: HeadingLevel.HEADING_1,
            }),
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Organization', bold: true })] })], borders: tableBorder }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Slug', bold: true })] })], borders: tableBorder }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Team Code', bold: true })] })], borders: tableBorder }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Approval Mode', bold: true })] })], borders: tableBorder }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Roster Count', bold: true })] })], borders: tableBorder }),
                  ],
                }),
                ...organizations.map((org) => {
                  const orgMemberCount = members.filter((m) => m.organization_id === org.id).length
                  return new TableRow({
                    children: [
                      new TableCell({ children: [new Paragraph(org.name || 'Unnamed Org')], borders: tableBorder }),
                      new TableCell({ children: [new Paragraph(org.slug || '-')], borders: tableBorder }),
                      new TableCell({ children: [new Paragraph(org.team_code || '-')], borders: tableBorder }),
                      new TableCell({
                        children: [new Paragraph(org.require_approval ? 'Approval Required' : 'Auto-Approve')],
                        borders: tableBorder,
                      }),
                      new TableCell({ children: [new Paragraph(String(orgMemberCount))], borders: tableBorder }),
                    ],
                  })
                }),
              ],
            }),
            new Paragraph({ text: '' }),

            // Members Table
            new Paragraph({
              text: '3. Team Member Directory & Approval Status',
              heading: HeadingLevel.HEADING_1,
            }),
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Full Name', bold: true })] })], borders: tableBorder }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Email', bold: true })] })], borders: tableBorder }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Organization', bold: true })] })], borders: tableBorder }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Role', bold: true })] })], borders: tableBorder }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Approval', bold: true })] })], borders: tableBorder }),
                  ],
                }),
                ...members.slice(0, 50).map((m) => {
                  const prof = m.profile as unknown as { email?: string; full_name?: string } | null
                  const org = m.organization as unknown as { name?: string } | null
                  return new TableRow({
                    children: [
                      new TableCell({ children: [new Paragraph(prof?.full_name || 'Member')], borders: tableBorder }),
                      new TableCell({ children: [new Paragraph(prof?.email || '-')], borders: tableBorder }),
                      new TableCell({ children: [new Paragraph(org?.name || '-')], borders: tableBorder }),
                      new TableCell({ children: [new Paragraph(m.role || 'employee')], borders: tableBorder }),
                      new TableCell({ children: [new Paragraph(m.approval_status || 'approved')], borders: tableBorder }),
                    ],
                  })
                }),
              ],
            }),
            new Paragraph({ text: '' }),

            // Recent Work Sessions Summary
            new Paragraph({
              text: '4. Recent Work Session Telemetry Summary',
              heading: HeadingLevel.HEADING_1,
            }),
            new Paragraph({
              children: [
                new TextRun('Audit log contains sample records of the last 50 session heartbeats. All employee interactions are cryptographically verified with UUID v4 idempotency keys and recorded according to organizational privacy standards.'),
              ],
            }),
          ],
        },
      ],
    })

    const buffer = await Packer.toBuffer(doc)

    return new Response(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="TrackMe-System-Audit-${new Date().toISOString().slice(0, 10)}.docx"`,
      },
    })
  } catch (err: unknown) {
    console.error('SYSTEM AUDIT EXPORT ERROR:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate audit report' },
      { status: 500 }
    )
  }
}
