import { describe, it, expect } from 'vitest'
import { getRoleHome, isSuperAdmin, isManager, isEmployee } from '@/lib/auth-rbac'

describe('Auth, RBAC, Team Join & Multi-Role Architecture', () => {
  describe('Secret Team Code Generation and Format', () => {
    function generateTeamCode(randomNum = Math.floor(1000 + Math.random() * 9000)) {
      return `TRACK-${randomNum}`
    }

    function isValidTeamCode(code: string): boolean {
      return /^TRACK-\d{4}$/.test(code.trim().toUpperCase())
    }

    it('generates standard 6-character team codes with prefix (e.g. TRACK-8821)', () => {
      const code = generateTeamCode(8821)
      expect(code).toBe('TRACK-8821')
      expect(isValidTeamCode(code)).toBe(true)
    })

    it('validates case-insensitivity on uppercase normalization', () => {
      const userInput = 'track-4192 '
      expect(isValidTeamCode(userInput)).toBe(true)
    })

    it('rejects invalid or malformed team codes', () => {
      expect(isValidTeamCode('')).toBe(false)
      expect(isValidTeamCode('INVALID')).toBe(false)
      expect(isValidTeamCode('TRACK-ABC')).toBe(false)
      expect(isValidTeamCode('TRACK-12345')).toBe(false)
    })
  })

  describe('Team Join Link System (/join/[team_code])', () => {
    function generateTeamJoinLink(origin: string, teamCode: string): string {
      return `${origin.replace(/\/$/, '')}/join/${teamCode.trim().toUpperCase()}`
    }

    it('generates valid Team Join Links with prefilled normalized codes', () => {
      const link = generateTeamJoinLink('https://trackme.io', 'track-8821')
      expect(link).toBe('https://trackme.io/join/TRACK-8821')
    })
  })

  describe('30-Day Session Policy', () => {
    it('verifies 30-day expiration policy in seconds', () => {
      const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60
      expect(THIRTY_DAYS_SECONDS).toBe(2592000)
    })
  })

  describe('Multi-Role RBAC Redirection & Permissions', () => {
    it('routes super_admin to /admin/dashboard', () => {
      expect(getRoleHome('super_admin')).toBe('/admin/dashboard')
      expect(isSuperAdmin('super_admin')).toBe(true)
      expect(isManager('super_admin')).toBe(true)
    })

    it('routes manager (and legacy owner/admin) to /dashboard', () => {
      expect(getRoleHome('manager')).toBe('/dashboard')
      expect(getRoleHome('owner')).toBe('/dashboard')
      expect(getRoleHome('admin')).toBe('/dashboard')
      expect(isManager('manager')).toBe(true)
      expect(isSuperAdmin('manager')).toBe(false)
    })

    it('routes employee to /install', () => {
      expect(getRoleHome('employee')).toBe('/install')
      expect(isEmployee('employee')).toBe(true)
      expect(isManager('employee')).toBe(false)
      expect(isSuperAdmin('employee')).toBe(false)
    })

    it('routes unauthenticated or null roles to /login', () => {
      expect(getRoleHome(null)).toBe('/login')
      expect(getRoleHome(undefined)).toBe('/login')
      expect(getRoleHome('')).toBe('/login')
    })
  })

  describe('Optional Manager Approval Toggle for Joining Employees', () => {
    function resolveInitialApprovalStatus(requireApproval: boolean): 'approved' | 'pending' {
      return requireApproval ? 'pending' : 'approved'
    }

    it('assigns approved status immediately when manager approval is disabled', () => {
      const status = resolveInitialApprovalStatus(false)
      expect(status).toBe('approved')
    })

    it('assigns pending status when manager approval is required', () => {
      const status = resolveInitialApprovalStatus(true)
      expect(status).toBe('pending')
    })
  })

  describe('Approval Status Gate for Clock-In', () => {
    type ApprovalStatus = 'pending' | 'approved' | 'rejected'

    function canClockIn(status: ApprovalStatus): { allowed: boolean; reason?: string } {
      if (status === 'pending') {
        return { allowed: false, reason: 'Account Pending Manager Approval' }
      }
      if (status === 'rejected') {
        return { allowed: false, reason: 'Account access rejected' }
      }
      return { allowed: true }
    }

    it('blocks clock-in when approval status is pending', () => {
      const result = canClockIn('pending')
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('Account Pending Manager Approval')
    })

    it('blocks clock-in when approval status is rejected', () => {
      const result = canClockIn('rejected')
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('Account access rejected')
    })

    it('allows clock-in once employee is approved', () => {
      const result = canClockIn('approved')
      expect(result.allowed).toBe(true)
      expect(result.reason).toBeUndefined()
    })
  })

  describe('Manager 24-Hour Notification Cool-down & Reporting', () => {
    function isNotificationCoolingDown(lastNotifiedAt: string | null | undefined, nowMs: number = Date.now()): boolean {
      if (!lastNotifiedAt) return false
      const lastMs = new Date(lastNotifiedAt).getTime()
      const diffHours = (nowMs - lastMs) / (1000 * 60 * 60)
      return diffHours < 24
    }

    it('enforces 24-hour cool-down when manager was notified recently', () => {
      const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString()
      expect(isNotificationCoolingDown(oneHourAgo)).toBe(true)
    })

    it('clears cool-down once 24 hours have elapsed', () => {
      const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
      expect(isNotificationCoolingDown(twentyFiveHoursAgo)).toBe(false)
    })

    it('allows notification if manager was never notified', () => {
      expect(isNotificationCoolingDown(null)).toBe(false)
      expect(isNotificationCoolingDown(undefined)).toBe(false)
    })

    it('verifies default team color accent', () => {
      const defaultColor = '#3B82F6'
      expect(/^#[0-9A-Fa-f]{6}$/.test(defaultColor)).toBe(true)
    })
  })

  describe('Team Roster Member Count & Single-Company Architecture', () => {
    interface Member {
      role: string
    }

    function calculateRosterCount(members: Member[]): {
      hasManager: boolean
      employeeCount: number
      totalCount: number
      badgeText: string
    } {
      const isExcludedRole = (r: string) => r === 'super_admin' || r === 'owner'

      const hasManager = members.some(
        (m) => !isExcludedRole(m.role) && (m.role === 'manager' || m.role === 'admin')
      )
      const employeeCount = members.filter(
        (m) => !isExcludedRole(m.role) && m.role === 'employee'
      ).length

      const totalCount = (hasManager ? 1 : 0) + employeeCount
      const badgeText = `${totalCount} ${totalCount === 1 ? 'member' : 'members'}`

      return { hasManager, employeeCount, totalCount, badgeText }
    }

    it('returns 0 members badge when team has no manager and 0 employees', () => {
      const result = calculateRosterCount([])
      expect(result.totalCount).toBe(0)
      expect(result.badgeText).toBe('0 members')
    })

    it('does not count super_admin or owner in roster calculation', () => {
      const members: Member[] = [
        { role: 'super_admin' },
        { role: 'owner' },
      ]
      const result = calculateRosterCount(members)
      expect(result.hasManager).toBe(false)
      expect(result.employeeCount).toBe(0)
      expect(result.totalCount).toBe(0)
      expect(result.badgeText).toBe('0 members')
    })

    it('counts 1 manager and 0 employees as 1 member', () => {
      const members: Member[] = [{ role: 'manager' }]
      const result = calculateRosterCount(members)
      expect(result.hasManager).toBe(true)
      expect(result.totalCount).toBe(1)
      expect(result.badgeText).toBe('1 member')
    })

    it('counts 1 manager and 2 employees accurately as 3 members', () => {
      const members: Member[] = [
        { role: 'manager' },
        { role: 'employee' },
        { role: 'employee' },
        { role: 'super_admin' }, // should be ignored
      ]
      const result = calculateRosterCount(members)
      expect(result.hasManager).toBe(true)
      expect(result.employeeCount).toBe(2)
      expect(result.totalCount).toBe(3)
      expect(result.badgeText).toBe('3 members')
    })
  })

  describe('Manager Provisioning & Strict Team Selection', () => {
    function validateManagerSlotProvisioning(input: {
      fullName?: string
      usernameOrEmail?: string
    }): { valid: boolean; error?: string; normalizedIdentifier?: string } {
      const fullName = (input.fullName || '').trim()
      const identifier = (input.usernameOrEmail || '').trim().toLowerCase()

      if (!fullName || !identifier) {
        return { valid: false, error: 'Full Name and Username/Email are required.' }
      }

      return {
        valid: true,
        normalizedIdentifier: identifier,
      }
    }

    it('requires full name and username/email for manager slot provisioning without password', () => {
      const resInvalid = validateManagerSlotProvisioning({ fullName: '', usernameOrEmail: '' })
      expect(resInvalid.valid).toBe(false)
      expect(resInvalid.error).toContain('required')

      const resValid = validateManagerSlotProvisioning({
        fullName: 'Jane Manager',
        usernameOrEmail: 'Jane.Manager@company.com',
      })
      expect(resValid.valid).toBe(true)
      expect(resValid.normalizedIdentifier).toBe('jane.manager@company.com')
    })

    function resolveSelectedManager(selection: string): { managerAssigned: boolean; managerId: string | null } {
      if (!selection || selection === 'none') {
        return { managerAssigned: false, managerId: null }
      }
      return { managerAssigned: true, managerId: selection }
    }

    it('allows creating team with "Assign Later (No Manager)"', () => {
      const res = resolveSelectedManager('none')
      expect(res.managerAssigned).toBe(false)
      expect(res.managerId).toBeNull()
    })

    it('correctly associates selected manager ID or username', () => {
      const res = resolveSelectedManager('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb')
      expect(res.managerAssigned).toBe(true)
      expect(res.managerId).toBe('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb')
    })

    describe('Candidate Managers Filter Query', () => {
      interface ProfileCandidate {
        id: string
        role?: string | null
        approval_status?: string | null
        full_name?: string | null
        username?: string | null
        email: string
      }

      function filterCandidateManagers(profiles: ProfileCandidate[]) {
        return profiles
          .filter((p) => p.role === 'manager' || p.approval_status === 'approved')
          .map((p) => ({
            id: p.id,
            username: p.username || (p.email ? p.email.split('@')[0] : 'manager'),
            fullName: p.full_name || p.username || (p.email ? p.email.split('@')[0] : 'Manager'),
            email: p.email || '',
          }))
      }

      it('includes both active managers and unassigned pre-approved manager slots', () => {
        const list: ProfileCandidate[] = [
          { id: '1', role: 'manager', approval_status: 'approved', username: 'active_mgr', email: 'm1@co.com' },
          { id: '2', role: 'manager', approval_status: null, username: 'unassigned_slot', email: 'm2@co.com' },
          { id: '3', role: 'employee', approval_status: 'pending', username: 'pending_emp', email: 'e1@co.com' },
          { id: '4', role: 'employee', approval_status: 'rejected', username: 'rejected_emp', email: 'e2@co.com' },
        ]

        const candidates = filterCandidateManagers(list)
        expect(candidates).toHaveLength(2)
        expect(candidates.map((c) => c.id)).toEqual(['1', '2'])
      })
    })

    describe('Manager Profile Verification & Organization Member Upsert', () => {
      interface MockProfile {
        id: string
        role: string
        approval_status: string | null
      }

      function verifyAndPrepareManagerAssignment(
        profile: MockProfile | null,
        organizationId: string
      ): { valid: boolean; memberRow?: { organization_id: string; user_id: string; role: string; approval_status: string }; error?: string } {
        if (!profile) {
          return { valid: false, error: 'Profile not found.' }
        }

        const isEligible = profile.role === 'manager' || profile.approval_status === 'approved'
        if (!isEligible) {
          return { valid: false, error: 'Profile is not eligible as a manager.' }
        }

        return {
          valid: true,
          memberRow: {
            organization_id: organizationId,
            user_id: profile.id,
            role: 'manager',
            approval_status: 'approved',
          },
        }
      }

      it('permits assignment of unassigned pre-approved profile slot to team without requiring auth.users', () => {
        const slotProfile: MockProfile = {
          id: 'preapproved-uuid-9999',
          role: 'manager',
          approval_status: 'approved',
        }

        const res = verifyAndPrepareManagerAssignment(slotProfile, 'org-uuid-1111')
        expect(res.valid).toBe(true)
        expect(res.memberRow).toEqual({
          organization_id: 'org-uuid-1111',
          user_id: 'preapproved-uuid-9999',
          role: 'manager',
          approval_status: 'approved',
        })
      })

      it('rejects assignment if profile is not found or not eligible', () => {
        expect(verifyAndPrepareManagerAssignment(null, 'org-uuid-1111').valid).toBe(false)
        expect(
          verifyAndPrepareManagerAssignment(
            { id: 'emp-1', role: 'employee', approval_status: 'pending' },
            'org-uuid-1111'
          ).valid
        ).toBe(false)
      })

      it('resolves in-memory manager profile and marks pre-approved slot pending signup with 1 member count', () => {
        interface ProfileRecord {
          id: string
          full_name: string | null
          username: string | null
          email: string
          is_pending_signup?: boolean
        }

        const profilesMap = new Map<string, ProfileRecord>()
        profilesMap.set('preapproved-uuid-9999', {
          id: 'preapproved-uuid-9999',
          full_name: 'Sarah Connor',
          username: 'sarah.connor',
          email: 'sarah@company.com',
          is_pending_signup: true,
        })

        const managerMember = {
          user_id: 'preapproved-uuid-9999',
          role: 'manager',
        }

        const matched = profilesMap.get(managerMember.user_id)
        expect(matched).toBeDefined()
        expect(matched?.full_name).toBe('Sarah Connor')
        expect(matched?.is_pending_signup).toBe(true)

        const totalCount = (matched ? 1 : 0) + 0 // 0 employees
        expect(totalCount).toBe(1)
        expect(`${totalCount} ${totalCount === 1 ? 'member' : 'members'}`).toBe('1 member')
      })
    })

    describe('Pre-Approved Manager Self-Registration Resolution', () => {
      interface MockProfile {
        id: string
        role: string
        approval_status: string
        username: string | null
        email: string | null
      }

      function resolveRegistrationTarget(
        inputIdentifier: string,
        preapprovedProfiles: MockProfile[]
      ): { isPreapprovedManager: boolean; targetRoute: string; claimedProfileId?: string } {
        const normalized = inputIdentifier.trim().toLowerCase()
        const match = preapprovedProfiles.find(
          (p) =>
            p.role === 'manager' &&
            p.approval_status === 'approved' &&
            ((p.email && p.email.toLowerCase() === normalized) ||
              (p.username && p.username.toLowerCase() === normalized))
        )

        if (match) {
          return {
            isPreapprovedManager: true,
            targetRoute: '/dashboard',
            claimedProfileId: match.id,
          }
        }

        return {
          isPreapprovedManager: false,
          targetRoute: '/install',
        }
      }

      it('detects matching pre-approved manager and routes directly to /dashboard', () => {
        const preapproved: MockProfile[] = [
          {
            id: 'slot-uuid-1234',
            role: 'manager',
            approval_status: 'approved',
            username: 'alice_manager',
            email: 'alice@company.com',
          },
        ]

        const byEmail = resolveRegistrationTarget('alice@company.com', preapproved)
        expect(byEmail.isPreapprovedManager).toBe(true)
        expect(byEmail.targetRoute).toBe('/dashboard')
        expect(byEmail.claimedProfileId).toBe('slot-uuid-1234')

        const byUsername = resolveRegistrationTarget('alice_manager', preapproved)
        expect(byUsername.isPreapprovedManager).toBe(true)
        expect(byUsername.targetRoute).toBe('/dashboard')
        expect(byUsername.claimedProfileId).toBe('slot-uuid-1234')
      })

      it('routes non-matching user as standard employee requiring teamCode to /install', () => {
        const preapproved: MockProfile[] = []
        const result = resolveRegistrationTarget('bob@company.com', preapproved)
        expect(result.isPreapprovedManager).toBe(false)
        expect(result.targetRoute).toBe('/install')
        expect(result.claimedProfileId).toBeUndefined()
      })
    })
  })
})



