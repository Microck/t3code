# Activity log

On web and desktop, consecutive tool calls appear as an expandable summary. Open it to inspect
commands, tool inputs, status, and exit codes. Expand a tool call to see its output. A running
command's output updates live, and long output shows only its most recent part. Use **Open diff** on
a file change to review its contents.

After a turn finishes, expand its work summary to read earlier assistant progress updates.
For ACP providers that reuse a message for progress and the reply, reported tool starts separate
the text into messages. Text sent without a reported boundary remains together.

T3 Orchestrator summaries describe the actions taken, such as **Ran 2 commands and sent messages
to 3 threads**. Repeated messages to the same destinations show both counts: **Sent 5 messages to
2 threads**. Thread creation counts the threads returned by the tool, including batches.

Groups with many kinds of activity show up to two specific action categories and a count of the
remaining actions. Commands, file changes, and orchestration changes take priority over reads and
status checks. Expand the group for the full list.

Failed calls do not count as successful messages or creations. Waiting on a thread does not mean
it finished, and an interrupt or cancellation request does not mean the thread stopped. When tool
details are unavailable, summaries use a broader description instead of guessing how many threads
were affected.
