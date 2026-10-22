import { ProviderDriverKind } from "@t3tools/contracts";
import { ProviderInstanceIcon } from "./ProviderInstanceIcon";
import {
  ompAgentMetrics,
  ompAgentStatus,
  type OmpTaskProgress,
} from "@t3tools/client-runtime/work-log/item-detail";

/** Native task progress stays inside its owning tool call, with no synthetic child chat. */
export function OmpTaskProgressDisplay({ progress }: { readonly progress: OmpTaskProgress }) {
  if (progress.kind === "jobs") {
    return (
      <ul aria-label="Background jobs" className="space-y-1 text-xs">
        {progress.jobs.map((job) => (
          <li key={job.id}>
            <details aria-label={job.label || job.id} className="border-b border-border/40 pb-1">
              <summary className="cursor-pointer py-1 text-foreground select-none">
                <ProviderInstanceIcon
                  driverKind={ProviderDriverKind.make("acpRegistry")}
                  displayName="OMP"
                  ompModel={job.resolvedModelIdentity ?? job.resolvedModel}
                  className="mr-1 inline-flex size-3 align-middle"
                  iconClassName="size-3"
                />
                <span className="font-medium">{job.label || job.id}</span>
                <span className="ml-2 text-muted-foreground">
                  {ompAgentStatus(job)} · {Math.floor(job.durationMs / 1000)}s
                </span>
              </summary>
              <div className="space-y-2 py-1 pl-4">
                <p>
                  {job.id} · {job.type}
                </p>
                {(job.resolvedModelIdentity ?? job.resolvedModel) ? (
                  <p className="break-all">{job.resolvedModelIdentity ?? job.resolvedModel}</p>
                ) : null}
                {job.resolvedThinkingLevel ? <p>Reasoning: {job.resolvedThinkingLevel}</p> : null}
                {job.exitCode !== undefined ? <p>Exit code: {job.exitCode}</p> : null}
                {job.errorText ? (
                  <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words text-destructive">
                    {job.errorText}
                  </pre>
                ) : null}
                {job.resultText ? (
                  <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words">
                    {job.resultText}
                  </pre>
                ) : null}
              </div>
            </details>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div aria-label="Task agents" className="space-y-1 text-xs">
      {progress.agents.map((agent) => (
        <details key={agent.id} className="border-b border-border/40 pb-1 last:border-0">
          <summary className="cursor-pointer py-1 text-foreground select-none">
            <ProviderInstanceIcon
              driverKind={ProviderDriverKind.make("acpRegistry")}
              displayName="OMP"
              ompModel={agent.resolvedModelIdentity ?? agent.resolvedModel}
              className="mr-1 inline-flex size-3 align-middle"
              iconClassName="size-3"
            />
            <span className="font-medium">{agent.id}</span>
            <span className="ml-2 text-muted-foreground">
              {agent.agent} · {ompAgentStatus(agent)}
              {agent.currentTool ? ` · ${agent.currentTool}` : ""}
            </span>
          </summary>
          <div className="space-y-2 py-1 pl-4">
            <p className="whitespace-pre-wrap text-foreground">
              {agent.description ?? agent.assignment ?? agent.task}
            </p>
            {agent.resolvedModel ? <p className="break-all">{agent.resolvedModel}</p> : null}
            <p className="text-muted-foreground">{ompAgentMetrics(agent)}</p>
            {agent.retryState ? (
              <p className="whitespace-pre-wrap text-destructive">
                {agent.retryState.errorMessage}
              </p>
            ) : null}
            {agent.currentTool ? (
              <div>
                <div className="font-medium">Current tool: {agent.currentTool}</div>
                {agent.currentToolArgs ? (
                  <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words">
                    {agent.currentToolArgs}
                  </pre>
                ) : null}
              </div>
            ) : null}
            {agent.recentTools.length ? (
              <div>
                <div className="font-medium">Recent tools</div>
                <ul className="space-y-1">
                  {agent.recentTools.map((tool) => (
                    <li
                      key={`${tool.endMs}:${tool.tool}`}
                      className={tool.isError ? "text-destructive" : "text-muted-foreground"}
                    >
                      <pre className="whitespace-pre-wrap break-words">
                        {tool.tool} {tool.args}
                      </pre>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {agent.recentOutput.length ? (
              <div>
                <div className="font-medium">Recent output</div>
                <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words text-muted-foreground">
                  {agent.recentOutput.join("\n")}
                </pre>
              </div>
            ) : null}
          </div>
        </details>
      ))}
    </div>
  );
}
