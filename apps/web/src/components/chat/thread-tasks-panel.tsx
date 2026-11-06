import type { EnvironmentId, OrchestrationV2PlanStep, ThreadId } from "@t3tools/contracts";
import { CheckIcon, CircleDotIcon, CircleIcon } from "lucide-react";

import { useQuietThreadProjection } from "../../state/entities";
import { deriveLatestTaskList } from "../../session-logic";
import { cn } from "../../lib/utils";
import { ThreadDetailsSection } from "./ThreadDetailsSection";

function TaskRow({ step }: { step: OrchestrationV2PlanStep }) {
  const Icon =
    step.status === "completed"
      ? CheckIcon
      : step.status === "running"
        ? CircleDotIcon
        : CircleIcon;
  return (
    <li
      aria-current={step.status === "running" ? "step" : undefined}
      className={cn(
        "flex items-start gap-2 py-1 text-xs",
        step.status === "running" && "font-medium text-foreground",
      )}
    >
      <Icon aria-hidden className="mt-0.5 size-3 shrink-0" />
      <span className="sr-only">{step.status}: </span>
      <span className="min-w-0 break-words">{step.text}</span>
    </li>
  );
}

export function ThreadTasksPanel(props: { environmentId: EnvironmentId; threadId: ThreadId }) {
  const projection = useQuietThreadProjection(props)?.projection;
  const list = deriveLatestTaskList(projection?.turnItems ?? []);
  if (!list || list.steps.length === 0) return null;
  const completed = list.steps.filter((step) => step.status === "completed");
  const remaining = list.steps.filter((step) => step.status !== "completed");
  return (
    <ThreadDetailsSection
      headingId="thread-details-tasks-heading"
      title="Tasks"
      actions={
        <span className="text-2xs tabular-nums">
          {completed.length}/{list.steps.length} completed
        </span>
      }
    >
      <div data-thread-details-task-list className="max-h-64 overflow-y-auto px-2.5">
        <ul aria-label="Current and pending tasks">
          {remaining.map((step) => (
            <TaskRow key={step.id} step={step} />
          ))}
        </ul>
        {completed.length > 0 ? (
          <details key={list.planId} className="mt-1">
            <summary className="cursor-pointer py-1 text-xs">
              Completed ({completed.length})
            </summary>
            <ul aria-label="Completed tasks" className="text-muted-foreground">
              {completed.map((step) => (
                <TaskRow key={step.id} step={step} />
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </ThreadDetailsSection>
  );
}
