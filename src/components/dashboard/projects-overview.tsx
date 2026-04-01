"use client";

import { Card, CardContent } from "@/components/ui/card";
import { StatusDot } from "./status-indicator";
import { FolderGit2, GitCommit, Brain } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import type { Project } from "@/types";

const typeColors: Record<string, string> = {
  wordpress: "bg-blue-500/10 text-blue-400",
  nextjs: "bg-zinc-500/10 text-zinc-300",
  infra: "bg-purple-500/10 text-purple-400",
  node: "bg-green-500/10 text-green-400",
};

function ProjectRow({ project }: { project: Project }) {
  const lastCommit = project.last_commit_at
    ? formatDistanceToNow(new Date(project.last_commit_at), { addSuffix: true })
    : null;

  const isStale = project.last_commit_at
    ? Date.now() - new Date(project.last_commit_at).getTime() > 7 * 24 * 60 * 60 * 1000
    : false;

  return (
    <div className="flex items-center justify-between py-3 border-b border-border/50 last:border-0">
      <div className="space-y-0.5 min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">{project.name}</p>
          <Badge variant="secondary" className={typeColors[project.project_type] || ""}>
            {project.project_type}
          </Badge>
          {project.ddev_running && (
            <StatusDot status="ok" size="sm" />
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {project.client_name && <span>{project.client_name}</span>}
          {lastCommit && (
            <span className={isStale ? "text-amber-400" : ""}>
              <GitCommit className="inline h-3 w-3 mr-0.5" />
              {lastCommit}
            </span>
          )}
          {project.memory_files_count > 0 && (
            <span>
              <Brain className="inline h-3 w-3 mr-0.5" />
              {project.memory_files_count}
            </span>
          )}
        </div>
        {project.last_commit_message && (
          <p className="text-xs text-muted-foreground truncate max-w-md">
            {project.last_commit_message}
          </p>
        )}
      </div>
      {project.github_url && (
        <a
          href={project.github_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors ml-4"
        >
          GitHub
        </a>
      )}
    </div>
  );
}

export function ProjectsOverviewSection({ projects }: { projects: Project[] }) {
  if (projects.length === 0) {
    return (
      <section>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <FolderGit2 className="h-5 w-5" /> Projects
        </h2>
        <Card className="bg-card/50">
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            No project data yet. Waiting for cockpit-agent...
          </CardContent>
        </Card>
      </section>
    );
  }

  const ddevRunning = projects.filter((p) => p.ddev_running).length;

  return (
    <section>
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <FolderGit2 className="h-5 w-5" /> Projects
        <span className="text-xs text-muted-foreground font-normal ml-auto">
          {projects.length} total &middot; {ddevRunning} DDEV active
        </span>
      </h2>
      <Card className="bg-card/50 backdrop-blur">
        <CardContent className="pt-4">
          {projects.map((p) => (
            <ProjectRow key={p.name} project={p} />
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
