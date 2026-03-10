<script lang="ts">
  import * as d3 from 'd3';
  import type { KnowledgeNode, NodeRelation } from '@/types/index';

  interface Props {
    nodes: KnowledgeNode[];
    edges: NodeRelation[];
    onNodeClick?: (node: KnowledgeNode) => void;
  }

  let { nodes, edges, onNodeClick }: Props = $props();

  let container: HTMLDivElement | undefined = $state();
  let width = $state(800);
  let height = $state(600);

  interface SimNode extends d3.SimulationNodeDatum {
    id: number;
    label: string;
    tags: string[];
    accessCount: number;
    data: KnowledgeNode;
  }

  interface SimLink extends d3.SimulationLinkDatum<SimNode> {
    similarity: number;
    type: string;
  }

  let simulation: d3.Simulation<SimNode, SimLink> | null = null;

  function buildGraph() {
    if (!container || nodes.length === 0) return;

    // Clear previous
    d3.select(container).selectAll('*').remove();

    const rect = container.getBoundingClientRect();
    width = rect.width || 800;
    height = rect.height || 600;

    const svg = d3.select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`);

    // Zoom
    const g = svg.append('g');
    svg.call(
      d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.2, 4])
        .on('zoom', (event) => {
          g.attr('transform', event.transform);
        }) as any
    );

    // Build node map
    const nodeMap = new Map<number, SimNode>();
    const simNodes: SimNode[] = nodes
      .filter((n): n is KnowledgeNode & { id: number } => n.id != null)
      .map((n) => {
        const simNode: SimNode = {
          id: n.id!,
          label: n.title.length > 20 ? n.title.slice(0, 20) + '…' : n.title,
          tags: n.tags,
          accessCount: n.accessCount,
          data: n,
        };
        nodeMap.set(n.id!, simNode);
        return simNode;
      });

    const simLinks: SimLink[] = edges
      .filter((e) => nodeMap.has(e.sourceId) && nodeMap.has(e.targetId))
      .map((e) => ({
        source: nodeMap.get(e.sourceId)!,
        target: nodeMap.get(e.targetId)!,
        similarity: e.similarity,
        type: e.type,
      }));

    // Force simulation
    simulation = d3.forceSimulation(simNodes)
      .force('link', d3.forceLink<SimNode, SimLink>(simLinks).id((d) => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide(30));

    // Edge color by type
    const edgeColor: Record<string, string> = {
      semantic: '#0d9488',
      url_domain: '#6366f1',
      tag_overlap: '#f59e0b',
      temporal: '#94a3b8',
    };

    // Links
    const link = g.append('g')
      .selectAll('line')
      .data(simLinks)
      .join('line')
      .attr('stroke', (d) => edgeColor[d.type] || '#94a3b8')
      .attr('stroke-opacity', (d) => 0.3 + d.similarity * 0.5)
      .attr('stroke-width', (d) => 1 + d.similarity * 2);

    // Nodes
    const node = g.append('g')
      .selectAll('g')
      .data(simNodes)
      .join('g')
      .call(
        d3.drag<SVGGElement, SimNode>()
          .on('start', (event, d) => {
            if (!event.active) simulation?.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event, d) => {
            if (!event.active) simulation?.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          }) as any
      );

    // Node circles
    const sizeScale = d3.scaleSqrt()
      .domain([0, d3.max(simNodes, (d) => d.accessCount) || 1])
      .range([6, 18]);

    node.append('circle')
      .attr('r', (d) => sizeScale(d.accessCount))
      .attr('fill', '#0d9488')
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5)
      .attr('cursor', 'pointer')
      .on('click', (_event: MouseEvent, d: SimNode) => {
        onNodeClick?.(d.data);
      });

    // Labels
    node.append('text')
      .text((d) => d.label)
      .attr('font-size', '10px')
      .attr('fill', '#e2e8f0')
      .attr('text-anchor', 'middle')
      .attr('dy', (d) => sizeScale(d.accessCount) + 14)
      .attr('pointer-events', 'none');

    // Tick
    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      node.attr('transform', (d) => `translate(${d.x},${d.y})`);
    });
  }

  $effect(() => {
    // Re-build when nodes/edges change
    if (container && nodes.length > 0) {
      buildGraph();
    }
    return () => {
      simulation?.stop();
    };
  });
</script>

<div
  bind:this={container}
  class="knowledge-graph-container"
>
  {#if nodes.length === 0}
    <div class="empty-state">
      <p>No knowledge nodes yet.</p>
      <p class="hint">Capture pages and add them to your knowledge graph to see connections.</p>
    </div>
  {/if}
</div>

<style>
  .knowledge-graph-container {
    width: 100%;
    height: 100%;
    min-height: 400px;
    background: var(--cp-slate-900, #0f172a);
    border-radius: 8px;
    overflow: hidden;
    position: relative;
  }

  .empty-state {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: var(--cp-slate-400, #94a3b8);
  }

  .empty-state p {
    margin: 4px 0;
  }

  .empty-state .hint {
    font-size: 12px;
    color: var(--cp-slate-500, #64748b);
  }
</style>
