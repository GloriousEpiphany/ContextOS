/**
 * ContextPrompt AI v4.0 — Workflow Templates
 * Predefined workflow templates for common use cases.
 */

import type { Workflow } from '@/types/index';

export const WORKFLOW_TEMPLATES: Workflow[] = [
  {
    id: 'academic-research',
    name: 'Academic Research',
    description: 'Capture a page, summarize it, add to knowledge base, and generate an AI-ready context.',
    trigger: 'manual',
    steps: [
      {
        id: 'step-1',
        type: 'capture',
        label: 'Capture Current Page',
        config: {},
      },
      {
        id: 'step-2',
        type: 'summarize',
        label: 'AI Summarize',
        config: {},
      },
      {
        id: 'step-3',
        type: 'search_knowledge',
        label: 'Find Related Knowledge',
        config: {},
      },
      {
        id: 'step-4',
        type: 'generate_prompt',
        label: 'Generate Context Package',
        config: { model: 'gpt-4o' },
      },
    ],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'competitive-analysis',
    name: 'Competitive Analysis',
    description: 'Capture a competitor page, extract key features, compare with existing knowledge, and export a report.',
    trigger: 'manual',
    steps: [
      {
        id: 'step-1',
        type: 'capture',
        label: 'Capture Competitor Page',
        config: {},
      },
      {
        id: 'step-2',
        type: 'summarize',
        label: 'Extract Features',
        config: {},
      },
      {
        id: 'step-3',
        type: 'search_knowledge',
        label: 'Compare with Knowledge Base',
        config: {},
      },
      {
        id: 'step-4',
        type: 'export',
        label: 'Export Report',
        config: {},
      },
    ],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'code-review',
    name: 'Code Review',
    description: 'Capture code content, analyze it, and generate a review prompt.',
    trigger: 'manual',
    steps: [
      {
        id: 'step-1',
        type: 'capture',
        label: 'Capture Code Page',
        config: {},
      },
      {
        id: 'step-2',
        type: 'summarize',
        label: 'Analyze Code',
        config: {},
      },
      {
        id: 'step-3',
        type: 'generate_prompt',
        label: 'Generate Review Prompt',
        config: { model: 'gpt-4o' },
      },
    ],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'content-curation',
    name: 'Content Curation',
    description: 'Capture a page, summarize it, extract tags, and add to knowledge base for future reference.',
    trigger: 'manual',
    steps: [
      {
        id: 'step-1',
        type: 'capture',
        label: 'Capture Page Content',
        config: {},
      },
      {
        id: 'step-2',
        type: 'summarize',
        label: 'AI Summarize',
        config: {},
      },
      {
        id: 'step-3',
        type: 'search_knowledge',
        label: 'Find Related Knowledge',
        config: {},
      },
      {
        id: 'step-4',
        type: 'export',
        label: 'Export Curated Entry',
        config: {},
      },
    ],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  },
];
