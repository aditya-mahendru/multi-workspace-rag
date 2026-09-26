import { useEffect, useState } from "react";
import { apiGet } from "../lib/api";

interface Task {
  id: string;
  title: string;
  details: string | null;
  created_at: string;
}

/** Tasks saved into this workspace by the save_task tool. */
export function TasksPanel({ workspaceId }: { workspaceId: string }) {
  const [tasks, setTasks] = useState<Task[]>([]);

  const load = () => {
    apiGet<{ tasks: Task[] }>(`/workspaces/${workspaceId}/tasks`).then(({ tasks: t }) => setTasks(t));
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [workspaceId]);

  return (
    <div>
      <h3 className="panel-title">Tasks</h3>
      <ul className="doc-list" style={{ marginTop: 0 }}>
        {tasks.map((t) => (
          <li key={t.id} className="doc-item">
            <strong>{t.title}</strong>
            {t.details && <div className="doc-meta" style={{ marginTop: 2 }}>{t.details}</div>}
          </li>
        ))}
        {tasks.length === 0 && <li className="empty-hint">No tasks saved yet.</li>}
      </ul>
    </div>
  );
}
