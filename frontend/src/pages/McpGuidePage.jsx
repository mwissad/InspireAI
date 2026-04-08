import { useState } from 'react';
import {
  Cable,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Terminal,
  Blocks,
  Rocket,
  Activity,
  BarChart3,
  ExternalLink,
  Zap,
  ArrowRight,
} from 'lucide-react';

// ── Copy button helper ──────────────────────────────

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const handle = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handle}
      className="absolute top-2.5 right-2.5 p-1.5 rounded-md text-text-tertiary hover:text-text-primary hover:bg-bg-subtle transition-smooth"
      title="Copy"
    >
      {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
    </button>
  );
}

// ── Code block ──────────────────────────────────────

function Code({ children, lang }) {
  const text = typeof children === 'string' ? children : '';
  return (
    <div className="relative group rounded-lg border border-border bg-[#0a0a0d] overflow-hidden">
      {lang && (
        <div className="px-3 py-1.5 border-b border-border text-[11px] font-mono text-text-tertiary uppercase tracking-wider">
          {lang}
        </div>
      )}
      <pre className="px-4 py-3 overflow-x-auto text-sm font-mono leading-relaxed text-text-secondary">
        {children}
      </pre>
      <CopyButton text={text} />
    </div>
  );
}

// ── Collapsible section ─────────────────────────────

function Collapsible({ title, icon: Icon, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-border bg-surface/60 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-bg-subtle transition-smooth"
      >
        {Icon && <Icon size={18} className="text-db-red shrink-0" />}
        <span className="text-sm font-semibold text-text-primary flex-1">{title}</span>
        {open ? (
          <ChevronDown size={16} className="text-text-tertiary" />
        ) : (
          <ChevronRight size={16} className="text-text-tertiary" />
        )}
      </button>
      {open && <div className="px-5 pb-5 space-y-4">{children}</div>}
    </div>
  );
}

// ── Tool card ───────────────────────────────────────

function ToolCard({ name, description, phase }) {
  const phaseColors = {
    Launch: 'text-db-red bg-db-red-50',
    Monitor: 'text-warning bg-warning/10',
    Results: 'text-success bg-success/10',
  };
  return (
    <div className="flex items-start gap-3 px-4 py-3 rounded-lg border border-border/50 bg-bg-subtle/50 hover:border-border transition-smooth">
      <div className="mt-0.5">
        <Terminal size={14} className="text-text-tertiary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <code className="text-sm font-mono font-semibold text-text-primary">{name}</code>
          <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${phaseColors[phase] || 'text-text-tertiary bg-bg-subtle'}`}>
            {phase}
          </span>
        </div>
        <p className="text-xs text-text-secondary mt-1 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

// ── Flow step ───────────────────────────────────────

function FlowStep({ number, title, description, color = 'text-db-red' }) {
  return (
    <div className="flex items-start gap-3">
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${color} bg-current/10 border border-current/20`}>
        <span className={color}>{number}</span>
      </div>
      <div>
        <div className="text-sm font-semibold text-text-primary">{title}</div>
        <div className="text-xs text-text-secondary mt-0.5">{description}</div>
      </div>
    </div>
  );
}

// ── MCP endpoint URL ────────────────────────────────

function getMcpUrl() {
  const loc = window.location;
  return `${loc.protocol}//${loc.host}/mcp/sse`;
}

// ── Main page ───────────────────────────────────────

const TOOLS = [
  { name: 'inspire_launch', description: 'Launch an Inspire AI analysis with business parameters, catalogs, and configuration.', phase: 'Launch' },
  { name: 'inspire_get_run_status', description: 'Check the Databricks notebook run lifecycle state (PENDING, RUNNING, TERMINATED).', phase: 'Monitor' },
  { name: 'inspire_cancel_run', description: 'Cancel an in-progress Inspire AI run.', phase: 'Monitor' },
  { name: 'inspire_get_session', description: 'Poll session completion percentage, processing status, and widget values.', phase: 'Monitor' },
  { name: 'inspire_get_steps', description: 'Get individual processing steps with incremental delta polling.', phase: 'Monitor' },
  { name: 'inspire_get_step_results', description: 'Get real-time progressive use case results while the analysis is still running.', phase: 'Monitor' },
  { name: 'inspire_get_results', description: 'Get the final complete analysis results from a finished session.', phase: 'Results' },
  { name: 'inspire_get_usecases', description: 'Get polished, scored use cases with priority, quality, value, and SQL.', phase: 'Results' },
  { name: 'inspire_list_sessions', description: 'List the 20 most recent Inspire AI sessions.', phase: 'Results' },
  { name: 'inspire_acknowledge', description: 'Mark a completed session as done after retrieving results.', phase: 'Results' },
];

const CLAUDE_DESKTOP_CONFIG = (url) => `{
  "mcpServers": {
    "inspire-ai": {
      "url": "${url}"
    }
  }
}`;

const CURSOR_CONFIG = (url) => `{
  "mcpServers": {
    "inspire-ai": {
      "url": "${url}"
    }
  }
}`;

const CLAUDE_CODE_CMD = (url) => `claude mcp add inspire-ai --transport sse ${url}`;

const PYTHON_EXAMPLE = (url) => `from mcp import ClientSession
from mcp.client.sse import sse_client

async def run_inspire():
    async with sse_client("${url}") as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()

            # 1. Launch an analysis
            result = await session.call_tool("inspire_launch", {
                "business_name": "Acme Corp",
                "inspire_database": "workspace._inspire",
                "warehouse_id": "your-warehouse-id",
                "operation_mode": "full",
                "catalogs": "main",
                "generate_choices": "genie,pdf",
                "output_language": "en"
            })
            run_id = ...  # parse from result

            # 2. Monitor progress
            status = await session.call_tool("inspire_get_session", {
                "inspire_database": "workspace._inspire",
                "warehouse_id": "your-warehouse-id"
            })

            # 3. Get results when done
            usecases = await session.call_tool("inspire_get_usecases", {
                "inspire_database": "workspace._inspire",
                "warehouse_id": "your-warehouse-id",
                "session_id": 1
            })`;

const TS_EXAMPLE = (url) => `import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

const transport = new SSEClientTransport(
  new URL("${url}")
);
const client = new Client({ name: "my-agent", version: "1.0.0" });
await client.connect(transport);

// 1. Launch an analysis
const run = await client.callTool({
  name: "inspire_launch",
  arguments: {
    business_name: "Acme Corp",
    inspire_database: "workspace._inspire",
    warehouse_id: "your-warehouse-id",
    operation_mode: "full",
    catalogs: "main",
  },
});

// 2. Poll session progress
const session = await client.callTool({
  name: "inspire_get_session",
  arguments: {
    inspire_database: "workspace._inspire",
    warehouse_id: "your-warehouse-id",
  },
});

// 3. Get final use cases
const usecases = await client.callTool({
  name: "inspire_get_usecases",
  arguments: {
    inspire_database: "workspace._inspire",
    warehouse_id: "your-warehouse-id",
    session_id: 1,
  },
});`;

export default function McpGuidePage() {
  const [activeTab, setActiveTab] = useState('claude-desktop');
  const mcpUrl = getMcpUrl();

  const tabs = [
    { id: 'claude-desktop', label: 'Claude Desktop' },
    { id: 'claude-code', label: 'Claude Code' },
    { id: 'cursor', label: 'Cursor' },
  ];

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-8">
      {/* Hero */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-db-red-50 border border-db-red/20 flex items-center justify-center">
            <Cable size={20} className="text-db-red" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-primary tracking-tight">MCP Server</h1>
            <p className="text-sm text-text-secondary">Connect your AI agent to Inspire AI</p>
          </div>
        </div>
        <p className="text-sm text-text-secondary leading-relaxed max-w-2xl">
          Inspire AI exposes an{' '}
          <a
            href="https://modelcontextprotocol.io"
            target="_blank"
            rel="noopener noreferrer"
            className="text-db-red hover:underline inline-flex items-center gap-1"
          >
            MCP (Model Context Protocol) <ExternalLink size={12} />
          </a>{' '}
          server that lets any compatible AI agent launch analyses, monitor progress in real time,
          and retrieve discovered use cases — all through natural language.
        </p>
      </div>

      {/* Endpoint banner */}
      <div className="relative rounded-xl border border-db-red/20 bg-db-red-50 px-5 py-4">
        <div className="text-[11px] font-semibold text-db-red uppercase tracking-wider mb-1.5">
          Your MCP Endpoint
        </div>
        <div className="flex items-center gap-3">
          <code className="text-sm font-mono text-text-primary flex-1 break-all">{mcpUrl}</code>
          <CopyButton text={mcpUrl} />
        </div>
      </div>

      {/* Workflow overview */}
      <div className="rounded-xl border border-border bg-surface/60 px-5 py-5">
        <h2 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Zap size={16} className="text-db-red" />
          How it works
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-db-red uppercase tracking-wider">
              <Rocket size={14} /> Launch
            </div>
            <p className="text-xs text-text-secondary leading-relaxed">
              Your agent calls <code className="text-text-primary">inspire_launch</code> with business
              parameters. A Databricks notebook run is submitted and a <code className="text-text-primary">run_id</code> is returned.
            </p>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-warning uppercase tracking-wider">
              <Activity size={14} /> Monitor
            </div>
            <p className="text-xs text-text-secondary leading-relaxed">
              Poll with <code className="text-text-primary">inspire_get_session</code> and{' '}
              <code className="text-text-primary">inspire_get_steps</code> to track real-time progress
              and discover use cases as they're generated.
            </p>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-success uppercase tracking-wider">
              <BarChart3 size={14} /> Results
            </div>
            <p className="text-xs text-text-secondary leading-relaxed">
              Retrieve polished use cases with{' '}
              <code className="text-text-primary">inspire_get_usecases</code> or full results with{' '}
              <code className="text-text-primary">inspire_get_results</code>. Acknowledge with{' '}
              <code className="text-text-primary">inspire_acknowledge</code>.
            </p>
          </div>
        </div>
      </div>

      {/* Quick start — client configuration */}
      <Collapsible title="Quick Start — Connect Your Client" icon={Blocks} defaultOpen>
        <p className="text-xs text-text-secondary">
          Add the Inspire AI MCP server to your preferred AI client. Pick your tool:
        </p>

        {/* Tab bar */}
        <div className="flex items-center gap-0.5 rounded-lg bg-bg-subtle p-0.5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 text-xs font-medium py-2 px-3 rounded-md transition-smooth ${
                activeTab === tab.id
                  ? 'bg-surface text-text-primary shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'claude-desktop' && (
          <div className="space-y-3">
            <div className="space-y-2">
              <FlowStep number="1" title="Open settings" description="Claude Desktop → Settings → Developer → Edit Config" />
              <FlowStep number="2" title="Add the server" description="Paste the following into your claude_desktop_config.json:" />
            </div>
            <Code lang="json">{CLAUDE_DESKTOP_CONFIG(mcpUrl)}</Code>
            <FlowStep number="3" title="Restart Claude Desktop" description="The inspire-ai tools will appear automatically." />
          </div>
        )}

        {activeTab === 'claude-code' && (
          <div className="space-y-3">
            <p className="text-xs text-text-secondary">Run this command in your terminal:</p>
            <Code lang="bash">{CLAUDE_CODE_CMD(mcpUrl)}</Code>
            <p className="text-xs text-text-secondary">
              The 10 Inspire AI tools will be available immediately in your Claude Code session.
            </p>
          </div>
        )}

        {activeTab === 'cursor' && (
          <div className="space-y-3">
            <div className="space-y-2">
              <FlowStep number="1" title="Open MCP settings" description="Cursor → Settings → MCP → Add new MCP server" />
              <FlowStep number="2" title="Configure the server" description="Set type to 'sse' and paste the URL, or add to .cursor/mcp.json:" />
            </div>
            <Code lang="json">{CURSOR_CONFIG(mcpUrl)}</Code>
          </div>
        )}
      </Collapsible>

      {/* Available tools */}
      <Collapsible title="Available Tools" icon={Terminal} defaultOpen>
        <p className="text-xs text-text-secondary mb-2">
          10 tools organized by workflow phase. Your agent can call them by name with the parameters described.
        </p>
        <div className="space-y-2">
          {TOOLS.map((tool) => (
            <ToolCard key={tool.name} {...tool} />
          ))}
        </div>
      </Collapsible>

      {/* Programmatic usage */}
      <Collapsible title="Programmatic Usage — Python" icon={Terminal}>
        <p className="text-xs text-text-secondary">
          Connect from a Python script or custom agent using the <code className="text-text-primary">mcp</code> SDK:
        </p>
        <Code lang="bash">pip install mcp</Code>
        <Code lang="python">{PYTHON_EXAMPLE(mcpUrl)}</Code>
      </Collapsible>

      <Collapsible title="Programmatic Usage — TypeScript" icon={Terminal}>
        <p className="text-xs text-text-secondary">
          Connect from a Node.js/TypeScript agent using the official MCP SDK:
        </p>
        <Code lang="bash">npm install @modelcontextprotocol/sdk</Code>
        <Code lang="typescript">{TS_EXAMPLE(mcpUrl)}</Code>
      </Collapsible>

      {/* Typical agent flow */}
      <Collapsible title="Typical Agent Workflow" icon={Zap}>
        <p className="text-xs text-text-secondary mb-3">
          Here's the recommended sequence an agent should follow:
        </p>
        <div className="space-y-3">
          <FlowStep
            number="1"
            title="inspire_launch"
            description="Submit the analysis with business name, catalogs, and parameters. Save the returned run_id."
            color="text-db-red"
          />
          <div className="ml-3.5 border-l border-border/50 h-3" />
          <FlowStep
            number="2"
            title="inspire_get_run_status"
            description="Poll every 10-30s until life_cycle_state is TERMINATED. Check result_state for SUCCESS or FAILED."
            color="text-warning"
          />
          <div className="ml-3.5 border-l border-border/50 h-3" />
          <FlowStep
            number="3"
            title="inspire_get_session"
            description="Poll every 3-5s for finer-grained progress (completed_percent). A null session means the notebook is still initializing."
            color="text-warning"
          />
          <div className="ml-3.5 border-l border-border/50 h-3" />
          <FlowStep
            number="4"
            title="inspire_get_step_results"
            description="(Optional) Fetch progressive results while the analysis runs — show use cases to the user as they're discovered."
            color="text-warning"
          />
          <div className="ml-3.5 border-l border-border/50 h-3" />
          <FlowStep
            number="5"
            title="inspire_get_usecases"
            description="Once completed, retrieve the polished, scored use cases — ready for presentation."
            color="text-success"
          />
          <div className="ml-3.5 border-l border-border/50 h-3" />
          <FlowStep
            number="6"
            title="inspire_acknowledge"
            description="Mark the session as done so it doesn't appear as pending on future polls."
            color="text-success"
          />
        </div>
      </Collapsible>

      {/* Authentication note */}
      <div className="rounded-xl border border-border bg-surface/60 px-5 py-4 space-y-2">
        <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
          <span className="text-warning">&#9888;</span> Authentication
        </h3>
        <p className="text-xs text-text-secondary leading-relaxed">
          Every tool accepts optional <code className="text-text-primary">token</code> and{' '}
          <code className="text-text-primary">host</code> parameters. If omitted, the server uses
          the configured <code className="text-text-primary">DATABRICKS_TOKEN</code> and{' '}
          <code className="text-text-primary">DATABRICKS_HOST</code> environment variables.
          For per-request auth, pass your Databricks PAT or OAuth2 token directly in the tool call.
        </p>
      </div>

      {/* API docs link */}
      <div className="flex items-center gap-3 text-xs text-text-tertiary">
        <span>Full REST API documentation available at</span>
        <a
          href="/api-docs"
          target="_blank"
          rel="noopener noreferrer"
          className="text-db-red hover:underline inline-flex items-center gap-1"
        >
          /api-docs <ExternalLink size={11} />
        </a>
      </div>
    </div>
  );
}
