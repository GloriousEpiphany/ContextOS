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

    d3.select(container).selectAll('*').remove();

    const rect = container.getBoundingClientRect();
    width = rect.width || 800;
    height = rect.height || 600;

    const svg = d3.select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .style('font-family', 'var(--font-body)');

    // Gradient defs
    const defs = svg.append('defs');
    const grad = defs.append('radialGradient').attr('id', 'nodeGlow');
    grad.append('stop').attr('offset', '0%').attr('stop-color', '#14b8a6').attr('stop-opacity', 0.3);
    grad.append('stop').attr('offset', '100%').attr('stop-color', '#14b8a6').attr('stop-opacity', 0);

    // Zoom group
    const g = svg.append('g');
    svg.call(
      d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.2, 4])
        .on('zoom', (event) => {
          g.attr('transform', event.transform);
        }) as any
    );

    // Background grid pattern
    const pattern = defs.append('pattern')
      .attr('id', 'grid')
      .attr('width', 30)
      .attr('height', 30)
      .attr('patternUnits', 'userSpaceOnUse');
    pattern.append('circle')
      .attr('cx', 15)
      .attr('cy', 15)
      .attr('r', 0.5)
      .attr('fill', '#334155')
      .attr('opacity', 0.4);

    g.append('rect')
      .attr('width', width * 3)
      .attr('height', height * 3)
      .attr('x', -width)
      .attr('y', -height)
      .attr('fill', 'url(#grid)');

    // Build simulation data
    const nodeMap = new Map<number, SimNode>();
    const simNodes: SimNode[] = nodes
      .filter((n): n is KnowledgeNode & { id: number } => n.id != null)
      .map((n) => {
        const simNode: SimNode = {
          id: n.id!,
          label: n.title.length > 18 ? n.title.slice(0, 18) + '…' : n.title,
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
      .force('link', d3.forceLink<SimNode, SimLink>(simLinks).id((d) => d.id).distance(120))
      .force('charge', d3.forceManyBody().strength(-250))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide(35));

    // Edge colors by type
    const edgeColor: Record<string, string> = {
      semantic: '#14b8a6',
      url_domain: '#818cf8',
      tag_overlap: '#f59e0b',
      temporal: '#64748b',
    };

    // Links
    const link = g.append('g')
      .selectAll('line')
      .data(simLinks)
      .join('line')
      .attr('stroke', (d) => edgeColor[d.type] || '#475569')
      .attr('stroke-opacity', (d) => 0.15 + d.similarity * 0.4)
      .attr('stroke-width', (d) => 0.8 + d.similarity * 1.5)
      .attr('stroke-dasharray', (d) => d.type === 'temporal' ? '3,3' : 'none');

    // Node groups
    const node = g.append('g')
      .selectAll('g')
      .data(simNodes)
      .join('g')
      .attr('cursor', 'pointer')
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

    const sizeScale = d3.scaleSqrt()
      .domain([0, d3.max(simNodes, (d) => d.accessCount) || 1])
      .range([7, 20]);

    // Glow circle
    node.append('circle')
      .attr('r', (d) => sizeScale(d.accessCount) + 8)
      .attr('fill', 'url(#nodeGlow)')
      .attr('opacity', 0.6);

    // Main circle
    node.append('circle')
      .attr('r', (d) => sizeScale(d.accessCount))
      .attr('fill', '#0d9488')
      .attr('stroke', '#0f766e')
      .attr('stroke-width', 1.5)
      .on('click', (_event: MouseEvent, d: SimNode) => {
        onNodeClick?.(d.data);
      });

    // Hover ring
    node.append('circle')
      .attr('r', (d) => sizeScale(d.accessCount) + 3)
      .attr('fill', 'none')
      .attr('stroke', '#2dd4bf')
      .attr('stroke-width', 0)
      .attr('opacity', 0);

    node
      .on('mouseenter', function () {
        d3.select(this).select('circle:nth-child(3)')
          .transition().duration(150)
          .attr('stroke-width', 2)
          .attr('opacity', 0.6);
      })
      .on('mouseleave', function () {
        d3.select(this).select('circle:nth-child(3)')
          .transition().duration(150)
          .attr('stroke-width', 0)
          .attr('opacity', 0);
      });

    // Labels
    node.append('text')
      .text((d) => d.label)
      .attr('font-size', '10px')
      .attr('fill', '#94a3b8')
      .attr('text-anchor', 'middle')
      .attr('dy', (d) => sizeScale(d.accessCount) + 14)
      .attr('pointer-events', 'none')
      .attr('font-weight', '500');

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
    if (container && nodes.length > 0) {
      buildGraph();
    }
    return () => {
      simulation?.stop();
    };
  });
</script>

<div bind:this={container} class="kg-container">
  {#if nodes.length === 0}
    <div class="kg-empty">
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
        <circle cx="14" cy="14" r="5" stroke="#475569" stroke-width="1.2" stroke-dasharray="3 2"/>
        <circle cx="34" cy="14" r="4" stroke="#475569" stroke-width="1.2" stroke-dasharray="3 2"/>
        <circle cx="24" cy="36" r="5" stroke="#475569" stroke-width="1.2" stroke-dasharray="3 2"/>
        <circle cx="38" cy="32" r="3" stroke="#475569" stroke-width="1.2" stroke-dasharray="3 2"/>
        <line x1="18" y1="16" x2="20" y2="32" stroke="#334155" stroke-width="0.8" opacity="0.4"/>
        <line x1="30" y1="16" x2="28" y2="32" stroke="#334155" stroke-width="0.8" opacity="0.4"/>
        <line x1="18" y1="14" x2="30" y2="14" stroke="#334155" stroke-width="0.8" opacity="0.4"/>
      </svg>
      <p class="kg-empty-title">Knowledge Graph</p>
      <p class="kg-empty-sub">Capture pages to see connections visualized here</p>
    </div>
  {/if}
</div>

<style>
  .kg-container {
    width: 100%;
    height: 100%;
    min-height: 400px;
    background: #0f172a;
    border-radius: 0;
    overflow: hidden;
    position: relative;
  }

  .kg-empty {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .kg-empty-title {
    margin: 4px 0 0;
    font-size: 14px;
    font-weight: 600;
    color: #64748b;
  }

  .kg-empty-sub {
    margin: 0;
    font-size: 12px;
    color: #475569;
  }
</style>
