export type DiscoveryProps = {
  project: any;
  inventory: any[];
  lineage: { nodes: any[]; edges: any[]; stats?: any };
  jobs: any[];
  assessmentRun: any | null;
  estate: any | null;
  samples: any[];
  discoveryRun: any | null;
  discoveryRunDiscover?: any | null;
  discoveryRunInventory?: any | null;
  discoveryRuns?: any[];
  busy: boolean;
  msg: string;
  sessionRole: string;
  sidStandards?: any | null;
  products?: any[];
  mappings?: any[];
  onBindSample: (sampleId?: string) => void;
  onUploadZip: (file: File) => void | Promise<void>;
  onBindGit: (payload: {
    url: string;
    branch: string;
    path_prefix: string;
    token?: string;
  }) => void;
  onSyncGit: (token?: string) => void;
  agentRuns: any[];
  onPollAgents: () => void;
  onPollDiscovery: (runId?: number) => void;
  onRunDiscovery: (pipeline?: "discover" | "inventory") => void;
  onRunAssessment: () => void;
  onSignOff: (payload?: {
    decisions?: Record<string, "accepted" | "flagged">;
    agent_run_id?: number | null;
  }) => void | Promise<void>;
  llmStatus?: any | null;
};
