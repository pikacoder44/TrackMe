"use client";

import { useState, useTransition } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Users,
  Plus,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  Bell,
  Clock,
  AlertCircle,
  Building2,
  Mail,
  User,
  UserPlus,
} from "lucide-react";
import {
  createTeamAction,
  notifyManagerAction,
  assignManagerToTeamAction,
  provisionManagerSlotAction,
} from "./actions";

interface TodayReportInfo {
  id: string;
  fileUrl: string;
  fileName: string;
  createdAt: string;
}

interface TeamManagerInfo {
  userId: string;
  fullName: string;
  username: string;
  email: string;
  hasUploadedToday: boolean;
  todayReport: TodayReportInfo | null;
  isNotifiedToday: boolean;
  lastNotifiedAt: string | null;
  isPendingSignup?: boolean;
}

interface TeamMemberInfo {
  id: string;
  userId: string;
  fullName: string;
  username: string;
  email: string;
  role: string;
  approvalStatus: string;
}

interface TeamItem {
  id: string;
  name: string;
  slug: string | null;
  teamCode: string | null;
  color: string;
  createdAt: string;
  totalCount: number;
  manager: TeamManagerInfo | null;
  members: TeamMemberInfo[];
}

interface CandidateManager {
  id: string;
  username: string;
  fullName: string;
  email: string;
}

interface AdminDashboardClientProps {
  teams: TeamItem[];
  candidateManagers: CandidateManager[];
}

const PRESET_COLORS = [
  { label: "Blue", value: "#3B82F6" },
  { label: "Emerald", value: "#10B981" },
  { label: "Indigo", value: "#6366F1" },
  { label: "Rose", value: "#F43F5E" },
  { label: "Amber", value: "#F59E0B" },
  { label: "Purple", value: "#8B5CF6" },
  { label: "Cyan", value: "#06B6D4" },
  { label: "Orange", value: "#EA580C" },
];

export function AdminDashboardClient({
  teams,
  candidateManagers,
}: AdminDashboardClientProps) {
  // Accordion open/close state per team id
  const [openTeamIds, setOpenTeamIds] = useState<Record<string, boolean>>({});

  // Local notification state to instantly reflect cool-downs without page refresh
  const [localNotified, setLocalNotified] = useState<Record<string, boolean>>(
    {},
  );

  // Modal state
  const [showNewTeamModal, setShowNewTeamModal] = useState(false);
  const [showAddManagerModal, setShowAddManagerModal] = useState(false);
  const [mgrFullName, setMgrFullName] = useState("");
  const [mgrEmail, setMgrEmail] = useState("");
  const [assigningTeam, setAssigningTeam] = useState<TeamItem | null>(null);
  const [assignManagerInput, setAssignManagerInput] = useState("");
  const [selectedColor, setSelectedColor] = useState<string>(
    PRESET_COLORS[0].value,
  );
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  // Toggle accordion card
  const toggleAccordion = (teamId: string) => {
    setOpenTeamIds((prev) => ({
      ...prev,
      [teamId]: !prev[teamId],
    }));
  };

  // Copy team join link
  const handleCopyLink = (code: string) => {
    if (!code) return;
    const link = `${window.location.origin}/join/${code}`;
    navigator.clipboard.writeText(link);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  // Handle Create Team
  const handleCreateTeamSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setMessage(null);
    const form = e.currentTarget;
    const formData = new FormData(form);
    formData.set("teamColor", selectedColor);

    startTransition(async () => {
      const res = await createTeamAction(formData);
      if (res.error) {
        setMessage({ type: "error", text: res.error });
      } else {
        setMessage({
          type: "success",
          text: `Team "${res.team?.name}" successfully created with Code ${res.team?.team_code}.`,
        });
        setShowNewTeamModal(false);
        form.reset();
      }
    });
  };

  const closeAddManagerModal = () => {
    setShowAddManagerModal(false);
    setMgrFullName("");
    setMgrEmail("");
  };

  // Handle Add / Provision Manager Slot
  const handleCreateManagerSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setMessage(null);

    const formData = new FormData();
    formData.append("fullName", mgrFullName);
    formData.append("usernameOrEmail", mgrEmail);

    startTransition(async () => {
      try {
        const res = await provisionManagerSlotAction(formData);
        if (res.error) {
          setMessage({ type: "error", text: res.error });
        } else {
          setMessage({
            type: "success",
            text: `Manager slot for "${res.manager?.fullName}" successfully pre-approved.`,
          });
          closeAddManagerModal();
        }
      } catch (err: unknown) {
        setMessage({
          type: "error",
          text:
            err instanceof Error
              ? err.message
              : "Failed to pre-approve manager slot.",
        });
      }
    });
  };

  // Handle Notify Manager (24h cooldown)
  const handleNotifyManager = (
    managerId: string,
    orgId: string,
    managerName: string,
  ) => {
    setMessage(null);
    startTransition(async () => {
      const res = await notifyManagerAction(managerId, orgId);
      if (res.error) {
        setMessage({ type: "error", text: res.error });
      } else {
        setLocalNotified((prev) => ({ ...prev, [managerId]: true }));
        setMessage({
          type: "success",
          text: `Notification dispatched to ${managerName}. 24-hour cool-down active.`,
        });
      }
    });
  };

  // Handle Assign Manager to Team
  const handleAssignManagerSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!assigningTeam) return;
    setMessage(null);

    startTransition(async () => {
      const res = await assignManagerToTeamAction(
        assigningTeam.id,
        assignManagerInput,
      );
      if (res.error) {
        setMessage({ type: "error", text: res.error });
      } else {
        setMessage({
          type: "success",
          text: `Manager successfully assigned to ${assigningTeam.name}.`,
        });
        setAssigningTeam(null);
        setAssignManagerInput("");
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Toast banner */}
      {message && (
        <div
          className={`p-4 rounded-xl border text-xs font-medium flex items-center justify-between shadow-sm animate-in fade-in ${
            message.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-900 dark:text-emerald-200"
              : "bg-destructive/10 border-destructive/20 text-destructive"
          }`}
        >
          <div className="flex items-center gap-2">
            {message.type === "success" ? (
              <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4" />
            )}
            <span>{message.text}</span>
          </div>
          <button
            onClick={() => setMessage(null)}
            className="text-[11px] font-semibold uppercase opacity-70 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Header bar with + Add Manager and + New Team Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b">
        <div className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
            Super Admin Portal
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground">
            Company departments, roster oversight, manager daily report status,
            and supervisor notifications.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            onClick={() => {
              setMgrFullName("");
              setMgrEmail("");
              setShowAddManagerModal(true);
            }}
            variant="outline"
            className="h-10 text-xs font-semibold gap-2 shadow-xs border-border/80"
          >
            <UserPlus className="w-4 h-4" />
            Add Manager
          </Button>
          <Button
            onClick={() => setShowNewTeamModal(true)}
            className="h-10 text-xs font-semibold gap-2 shadow-xs"
          >
            <Plus className="w-4 h-4" />
            New Team
          </Button>
        </div>
      </div>

      {/* Interactive Accordion Team Roster */}
      <div className="space-y-3">
        {teams.map((team) => {
          const isOpen = Boolean(openTeamIds[team.id]);
          const isCopied = copiedCode === team.teamCode;
          const isCoolingDown =
            localNotified[team.manager?.userId ?? ""] ||
            team.manager?.isNotifiedToday;

          return (
            <Card
              key={team.id}
              className="border-border/60 shadow-sm transition-all duration-200 overflow-hidden"
              style={{ borderLeftWidth: "4px", borderLeftColor: team.color }}
            >
              {/* Collapsible Header */}
              <div
                onClick={() => toggleAccordion(team.id)}
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-muted/30 transition-colors select-none"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm"
                    style={{ backgroundColor: team.color }}
                  />
                  <div className="min-w-0">
                    <div className="font-bold text-sm md:text-base text-foreground truncate flex items-center gap-2">
                      <span>{team.name}</span>
                      <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-muted text-muted-foreground border">
                        {team.teamCode || "NO-CODE"}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {team.manager ? (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span>
                            Manager: <strong>{team.manager.fullName}</strong> (@
                            {team.manager.username})
                          </span>
                          {team.manager.isPendingSignup && (
                            <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-800 dark:text-blue-300 border border-blue-500/30">
                              Pre-Approved Slot
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400 font-medium">
                          No Manager Assigned
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {/* Team Code Copy Button */}
                  {team.teamCode && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyLink(team.teamCode!);
                      }}
                      className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors border"
                      title="Copy Team Join Link"
                    >
                      {isCopied ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span className="text-[11px] font-medium">
                        {isCopied ? "Link Copied" : "Join Link"}
                      </span>
                    </button>
                  )}

                  {/* Member count pill */}
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-muted text-muted-foreground border">
                    {(team.manager ? 1 : 0) + team.members.length}{" "}
                    {(team.manager ? 1 : 0) + team.members.length === 1
                      ? "member"
                      : "members"}
                  </span>

                  {/* Accordion Chevron */}
                  <div className="text-muted-foreground">
                    {isOpen ? (
                      <ChevronUp className="w-5 h-5" />
                    ) : (
                      <ChevronDown className="w-5 h-5" />
                    )}
                  </div>
                </div>
              </div>

              {/* Accordion Content */}
              {isOpen && (
                <CardContent className="p-4 pt-2 border-t border-border/40 space-y-4 bg-muted/10 animate-in fade-in duration-200">
                  {/* 1. Manager Card */}
                  {team.manager ? (
                    <div className="p-4 rounded-xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 border border-emerald-500/30">
                            Team Manager
                          </span>
                          {team.manager.isPendingSignup ? (
                            <span className="text-[10px] uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-blue-500/15 text-blue-800 dark:text-blue-300 border border-blue-500/30 font-semibold">
                              Pre-Approved Slot (Pending Sign-up)
                            </span>
                          ) : team.manager.hasUploadedToday ? (
                            <span className="text-[10px] uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-600 text-white font-semibold shadow-xs">
                              Report Uploaded Today
                            </span>
                          ) : (
                            <span className="text-[10px] uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-900 dark:text-amber-300 border border-amber-500/40 font-semibold">
                              Report Missing Today
                            </span>
                          )}
                        </div>

                        <div>
                          <div className="font-bold text-sm text-foreground">
                            {team.manager.fullName}{" "}
                            <span className="font-mono text-xs text-muted-foreground font-normal">
                              (@{team.manager.username})
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                            <Mail className="w-3 h-3 text-muted-foreground" />
                            <span>{team.manager.email}</span>
                          </div>
                        </div>
                      </div>

                      {/* Manager Action: Download Report OR Notify Button */}
                      <div className="flex items-center gap-2 shrink-0">
                        {team.manager.hasUploadedToday &&
                        team.manager.todayReport ? (
                          <a
                            href={team.manager.todayReport.fileUrl}
                            download={team.manager.todayReport.fileName}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Button
                              size="sm"
                              className="text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                            >
                              <Download className="w-3.5 h-3.5" />
                              Download Report
                            </Button>
                          </a>
                        ) : (
                          <Button
                            size="sm"
                            variant={isCoolingDown ? "outline" : "default"}
                            className={`text-xs gap-1.5 ${
                              isCoolingDown
                                ? "opacity-60 cursor-not-allowed bg-muted text-muted-foreground"
                                : "bg-amber-600 hover:bg-amber-700 text-white shadow-xs"
                            }`}
                            disabled={isPending || Boolean(isCoolingDown)}
                            onClick={() =>
                              handleNotifyManager(
                                team.manager!.userId,
                                team.id,
                                team.manager!.fullName,
                              )
                            }
                          >
                            {isCoolingDown ? (
                              <>
                                <Clock className="w-3.5 h-3.5" />
                                Notified Today (Cool-down)
                              </>
                            ) : (
                              <>
                                <Bell className="w-3.5 h-3.5" />
                                Notify Manager
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* Clean Empty Manager Card */
                    <div className="p-4 rounded-xl border border-dashed border-border/80 bg-muted/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-muted text-muted-foreground border">
                            No Manager Assigned
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          This team currently has no supervising manager
                          assigned to submit daily telemetry reports.
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs font-semibold gap-1.5 shrink-0 border-border/80 hover:bg-muted"
                        onClick={() => {
                          setAssigningTeam(team);
                          setAssignManagerInput("");
                        }}
                      >
                        <UserPlus className="w-3.5 h-3.5" />+ Assign Manager
                      </Button>
                    </div>
                  )}

                  {/* 2. Team Members List (Distinct secondary color styling) */}
                  <div className="p-4 rounded-xl border border-border/80 bg-muted/40 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5" />
                        <span>Team Members ({team.members.length})</span>
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        Join link:{" "}
                        <code className="font-mono font-semibold">
                          /join/{team.teamCode}
                        </code>
                      </span>
                    </div>

                    {team.members.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {team.members.map((member) => (
                          <div
                            key={member.id}
                            className="p-2.5 rounded-lg border bg-background flex items-center justify-between text-xs"
                          >
                            <div className="min-w-0 space-y-0.5">
                              <div className="font-semibold text-foreground truncate">
                                {member.fullName}{" "}
                                <span className="font-mono text-[11px] text-muted-foreground font-normal">
                                  (@{member.username})
                                </span>
                              </div>
                              <div className="text-[11px] text-muted-foreground truncate">
                                {member.email}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0 ml-2">
                              <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-muted text-muted-foreground border">
                                {member.role}
                              </span>
                              <span
                                className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded border ${
                                  member.approvalStatus === "approved"
                                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
                                    : "bg-amber-500/20 text-amber-900 dark:text-amber-300 border-amber-500/40 font-semibold"
                                }`}
                              >
                                {member.approvalStatus}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-4 text-center text-xs text-muted-foreground border border-dashed rounded-lg bg-background/50">
                        No employees currently assigned to this team. New
                        members can join using code{" "}
                        <strong className="font-mono text-foreground">
                          {team.teamCode}
                        </strong>
                        .
                      </div>
                    )}
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}

        {teams.length === 0 && (
          <div className="p-12 text-center rounded-xl border border-dashed bg-muted/20 text-muted-foreground space-y-3">
            <Building2 className="w-8 h-8 mx-auto text-muted-foreground" />
            <div className="font-bold text-sm text-foreground">
              No Departments Created Yet
            </div>
            <p className="text-xs max-w-sm mx-auto">
              Click the + New Team button above to create a team, select a color
              accent, and assign a manager.
            </p>
          </div>
        )}
      </div>

      {/* Modal: + New Team */}
      {showNewTeamModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in">
          <Card className="w-full max-w-md shadow-2xl border-border/80">
            <CardHeader>
              <CardTitle className="text-lg font-bold">
                Create New Department Team
              </CardTitle>
              <CardDescription className="text-xs">
                Configure department identity, select a color accent, and assign
                the supervising manager.
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleCreateTeamSubmit}>
              <CardContent className="space-y-4 text-xs">
                {/* 1. Team Name */}
                <div className="space-y-1">
                  <label
                    htmlFor="teamName"
                    className="font-semibold text-muted-foreground"
                  >
                    Team Name
                  </label>
                  <Input
                    id="teamName"
                    name="teamName"
                    placeholder="e.g. Core Platform Engineering"
                    required
                    className="h-10 text-xs"
                  />
                </div>

                {/* 2. Team Color Accent */}
                <div className="space-y-2">
                  <label className="font-semibold text-muted-foreground flex items-center justify-between">
                    <span>Color Accent</span>
                    <span className="font-mono text-[11px] text-foreground">
                      {selectedColor}
                    </span>
                  </label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => setSelectedColor(c.value)}
                        className={`w-7 h-7 rounded-full transition-transform flex items-center justify-center ${
                          selectedColor === c.value
                            ? "scale-110 ring-2 ring-foreground ring-offset-2 ring-offset-background"
                            : "hover:scale-105"
                        }`}
                        style={{ backgroundColor: c.value }}
                        title={c.label}
                      >
                        {selectedColor === c.value && (
                          <Check className="w-3.5 h-3.5 text-white" />
                        )}
                      </button>
                    ))}
                    <input
                      type="color"
                      value={selectedColor}
                      onChange={(e) => setSelectedColor(e.target.value)}
                      className="w-7 h-7 rounded-full p-0 border-0 cursor-pointer"
                      title="Custom Color"
                    />
                  </div>
                </div>

                {/* 3. Strict Manager Selection */}
                <div className="space-y-1">
                  <label
                    htmlFor="managerSelect"
                    className="font-semibold text-muted-foreground flex items-center justify-between"
                  >
                    <span>Supervising Manager</span>
                    <span className="text-[10px] text-muted-foreground">
                      Strict Selection
                    </span>
                  </label>
                  <div className="relative">
                    <select
                      id="managerSelect"
                      name="managerId"
                      className="w-full h-10 px-3 pl-8 text-xs rounded-md border border-input bg-background text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring appearance-none cursor-pointer"
                      defaultValue="none"
                    >
                      <option value="none">Assign Later (No Manager)</option>
                      {candidateManagers.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.fullName} (@{m.username || m.email})
                        </option>
                      ))}
                    </select>
                    <User className="w-4 h-4 text-muted-foreground absolute left-2.5 top-3 pointer-events-none" />
                    <ChevronDown className="w-4 h-4 text-muted-foreground absolute right-2.5 top-3 pointer-events-none opacity-60" />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Select a provisioned manager or choose &quot;Assign
                    Later&quot; to leave unassigned.
                  </p>
                </div>
              </CardContent>

              <div className="p-4 border-t flex justify-end gap-2 bg-muted/20">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowNewTeamModal(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={isPending}>
                  {isPending ? "Creating Team..." : "Create Team"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Modal: + Add Manager */}
      {showAddManagerModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              closeAddManagerModal();
            }
          }}
        >
          <Card className="w-full max-w-md shadow-2xl border-border/80">
            <CardHeader>
              <CardTitle className="text-lg font-bold">
                Pre-Approve Manager Slot
              </CardTitle>
              <CardDescription className="text-xs">
                Pre-approve a manager slot. The manager will set their own
                password when registering on the portal.
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleCreateManagerSubmit}>
              <CardContent className="space-y-4 text-xs">
                {/* 1. Full Name */}
                <div className="space-y-1">
                  <label
                    htmlFor="mgrFullName"
                    className="font-semibold text-muted-foreground"
                  >
                    Full Name
                  </label>
                  <Input
                    id="mgrFullName"
                    name="fullName"
                    value={mgrFullName}
                    onChange={(e) => setMgrFullName(e.target.value)}
                    placeholder="e.g. Sarah Connor"
                    required
                    className="h-10 text-xs"
                    autoFocus
                  />
                </div>

                {/* 2. Username / Email */}
                <div className="space-y-1">
                  <label
                    htmlFor="mgrIdentifier"
                    className="font-semibold text-muted-foreground flex items-center justify-between"
                  >
                    <span>Username / Email</span>
                    <span className="text-[10px] text-muted-foreground">
                      Pre-approved identifier
                    </span>
                  </label>
                  <div className="relative">
                    <Input
                      id="mgrIdentifier"
                      name="usernameOrEmail"
                      value={mgrEmail}
                      onChange={(e) => setMgrEmail(e.target.value)}
                      placeholder="e.g. sarah.connor or sarah@company.com"
                      required
                      className="h-10 text-xs pl-8 font-mono"
                    />
                    <User className="w-4 h-4 text-muted-foreground absolute left-2.5 top-3 pointer-events-none" />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Matches during registration to claim manager supervisory
                    rights without requiring team codes.
                  </p>
                </div>
              </CardContent>

              <div className="p-4 border-t flex justify-end gap-2 bg-muted/20">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={closeAddManagerModal}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={isPending}>
                  {isPending ? "Pre-Approving..." : "Pre-Approve Manager"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Modal: + Assign Manager */}
      {assigningTeam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in">
          <Card className="w-full max-w-md shadow-2xl border-border/80">
            <CardHeader>
              <CardTitle className="text-lg font-bold">
                Assign Manager
              </CardTitle>
              <CardDescription className="text-xs">
                Assign a supervising manager to{" "}
                <strong>{assigningTeam.name}</strong>.
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleAssignManagerSubmit}>
              <CardContent className="space-y-4 text-xs">
                <div className="space-y-1">
                  <label
                    htmlFor="assignManagerSelect"
                    className="font-semibold text-muted-foreground flex items-center justify-between"
                  >
                    <span>Select Manager</span>
                    <span className="text-[10px] text-muted-foreground">
                      Approved Managers
                    </span>
                  </label>
                  <div className="relative">
                    <select
                      id="assignManagerSelect"
                      value={assignManagerInput}
                      onChange={(e) => setAssignManagerInput(e.target.value)}
                      className="w-full h-10 px-3 pl-8 text-xs rounded-md border border-input bg-background text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring appearance-none cursor-pointer"
                      required
                    >
                      <option value="" disabled>
                        -- Select a Provisioned Manager --
                      </option>
                      {candidateManagers.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.fullName} (@{m.username || m.email})
                        </option>
                      ))}
                    </select>
                    <User className="w-4 h-4 text-muted-foreground absolute left-2.5 top-3 pointer-events-none" />
                    <ChevronDown className="w-4 h-4 text-muted-foreground absolute right-2.5 top-3 pointer-events-none opacity-60" />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Grants manager permissions and supervisory controls for this
                    department.
                  </p>
                </div>
              </CardContent>

              <div className="p-4 border-t flex justify-end gap-2 bg-muted/20">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setAssigningTeam(null);
                    setAssignManagerInput("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isPending || !assignManagerInput.trim()}
                >
                  {isPending ? "Assigning..." : "Assign Manager"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
