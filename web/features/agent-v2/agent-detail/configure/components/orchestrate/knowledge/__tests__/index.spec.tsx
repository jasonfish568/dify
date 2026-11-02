import type { DatasetDocMetadataResponse } from '@dify/contracts/api/console/datasets/types.gen'
import type { KnowledgeFsSpaceListItemResponse } from '@dify/contracts/api/console/knowledge-fs/types.gen'
import type { Node, Var } from '@/app/components/workflow/types'
import type {
  AgentKnowledgeRetrievalItem,
  AgentSoulConfigFormState,
} from '@/features/agent-v2/agent-composer/form-state'
import { zKnowledgeFsSpaceListResponse } from '@dify/contracts/api/console/knowledge-fs/zod.gen'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAtomValue } from 'jotai'
import { ReactFlowProvider } from 'reactflow'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import {
  ComparisonOperator,
  LogicalOperator,
  MetadataFilteringModeEnum,
  MetadataFilteringVariableType,
} from '@/app/components/workflow/nodes/knowledge-retrieval/types'
import { BlockEnum, VarType } from '@/app/components/workflow/types'
import { formStateToAgentSoulConfig } from '@/features/agent-v2/agent-composer/conversions'
import { defaultAgentSoulConfigFormState } from '@/features/agent-v2/agent-composer/form-state'
import { AgentComposerProvider } from '@/features/agent-v2/agent-composer/provider'
import { agentComposerDraftAtom } from '@/features/agent-v2/agent-composer/store'
import { RerankingModeEnum } from '@/models/datasets'
import { consoleQuery } from '@/service/console'
import {
  createConsoleQueryClient,
  renderWithConsoleQuery as render,
} from '@/test/console/query-data'
import { AgentOrchestratePanel } from '../../index'
import {
  AgentOrchestrateReadOnlyContext,
  AgentOrchestrateViewingVersionContext,
} from '../../read-only-context'
import { AgentKnowledgeRetrieval } from '../index'

vi.mock('@/features/agent-v2/agent-detail/configure/feature-flags', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/features/agent-v2/agent-detail/configure/feature-flags')
  >()),
  ENABLE_AGENT_KNOWLEDGE_RETRIEVAL: true,
}))

// Keep the configuration panel and retrieval editor real; unrelated editors have their own suites.
vi.mock('../../advanced', () => ({ AgentAdvancedSettings: () => null }))
vi.mock('../../model-config/field', () => ({ AgentModelField: () => null }))
vi.mock('../../prompt-editor', () => ({
  AgentPromptEditor: () => null,
  AgentTemplatePromptEditor: () => null,
}))
vi.mock('../../skills', () => ({ AgentSkills: () => null, AgentTemplateSkills: () => null }))
vi.mock('../../files', () => ({ AgentFiles: () => null, AgentTemplateFiles: () => null }))
vi.mock('../../tools', () => ({ AgentTools: () => null, AgentTemplateTools: () => null }))

vi.mock('@/app/components/workflow/nodes/_base/hooks/use-available-var-list', () => ({
  default: (_nodeId: string, { filterVar }: { filterVar: (value: Var) => boolean }) => ({
    availableVars: [
      {
        nodeId: 'start',
        title: 'Start',
        isStartNode: true,
        vars: [
          { variable: 'program_input', type: VarType.number },
          { variable: 'item_input', type: VarType.string },
        ].filter(filterVar),
      },
    ],
    availableNodesWithParent: [
      {
        id: 'start',
        position: { x: 0, y: 0 },
        data: { type: BlockEnum.Start, title: 'Start', desc: '' },
      } satisfies Node,
    ],
  }),
}))

const datasetQuery = vi.hoisted(() => ({
  pages: [] as Array<{ data: unknown[] }>,
  notify: () => {},
  error: null as Error | null,
}))
vi.mock('@/service/console', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/service/console')>()
  const datasetsQuery = new Proxy(actual.consoleQuery.datasets, {
    get(target, property, receiver) {
      if (property !== 'get') return Reflect.get(target, property, receiver)
      return {
        ...target.get,
        queryOptions: (...args: Parameters<typeof target.get.queryOptions>) => ({
          ...target.get.queryOptions(...args),
          retry: false,
          initialData: datasetQuery.pages[0],
          queryFn: () => {
            if (datasetQuery.error) return Promise.reject(datasetQuery.error)
            return new Promise((resolve) => {
              datasetQuery.notify = () => resolve(datasetQuery.pages[0])
            })
          },
        }),
      }
    },
  })
  return {
    ...actual,
    consoleQuery: new Proxy(actual.consoleQuery, {
      get(target, property, receiver) {
        if (property === 'datasets') return datasetsQuery
        return Reflect.get(target, property, receiver)
      },
    }),
  }
})

vi.mock('@/context/workspace-state', async () => {
  const { createWorkspaceStateModuleMock } = await import('@/test/console/state-fixture')
  return createWorkspaceStateModuleMock(() => ({
    currentWorkspace: { id: 'workspace-1' },
  }))
})

vi.mock('@/app/components/workflow/nodes/knowledge-retrieval/components/add-dataset', () => ({
  default: function MockAddKnowledge({
    onChange,
  }: {
    onChange: (
      datasets: Array<{
        id: string
        name: string
        indexing_technique: string
        provider: string
        embedding_model_provider: string
        embedding_model: string
        retrieval_model_dict: {
          search_method: string
        }
        is_multimodal: boolean
        doc_metadata: DatasetDocMetadataResponse[]
      }>,
    ) => void
  }) {
    return (
      <button
        type="button"
        aria-label="common.operation.add workflow.nodes.knowledgeRetrieval.knowledge"
        onClick={() =>
          onChange([
            {
              id: 'dataset-2',
              name: 'Release Docs',
              indexing_technique: 'high_quality',
              provider: 'internal',
              embedding_model_provider: 'openai',
              embedding_model: 'text-embedding-3',
              retrieval_model_dict: {
                search_method: 'semantic',
              },
              is_multimodal: false,
              doc_metadata: [
                {
                  id: 'program-metadata',
                  name: 'guide_program_id',
                  type: MetadataFilteringVariableType.number,
                },
                {
                  id: 'item-metadata',
                  name: 'guide_item_id',
                  type: MetadataFilteringVariableType.string,
                },
              ],
            },
          ])
        }
      >
        Add mock knowledge
      </button>
    )
  },
}))

vi.mock('@/app/components/header/account-setting/model-provider-page/hooks', () => ({
  useModelListAndDefaultModelAndCurrentProviderAndModel: vi.fn(() => ({
    modelList: [
      {
        provider: 'rerank-provider',
        models: [{ model: 'rerank-model' }],
      },
    ],
    defaultModel: {
      provider: {
        provider: 'rerank-provider',
      },
      model: 'rerank-model',
    },
  })),
  useCurrentProviderAndModel: vi.fn(() => ({
    currentProvider: { provider: 'rerank-provider' },
    currentModel: { model: 'rerank-model' },
  })),
}))

const agentKnowledgeDraft = {
  ...defaultAgentSoulConfigFormState,
  knowledgeRetrievals: [
    {
      id: 'retrieval-1',
      name: 'agentV2.agentDetail.configure.knowledgeRetrieval.retrievalOne',
    },
  ],
} satisfies AgentSoulConfigFormState

function ConfigSnapshotPreview() {
  const draft = useAtomValue(agentComposerDraftAtom)
  const configSnapshot = formStateToAgentSoulConfig({ formState: draft })

  return <output aria-label="config snapshot">{JSON.stringify(configSnapshot.knowledge)}</output>
}

function renderKnowledgeRetrieval({
  initialDraft = agentKnowledgeDraft,
  readOnly = false,
  viewingVersion = false,
  showConfigSnapshot = false,
  workflowNodeId,
  throughPanel = false,
}: {
  initialDraft?: AgentSoulConfigFormState
  readOnly?: boolean
  viewingVersion?: boolean
  showConfigSnapshot?: boolean
  workflowNodeId?: string
  throughPanel?: boolean
} = {}) {
  return render(
    <AgentComposerProvider initialDraft={initialDraft}>
      <AgentOrchestrateViewingVersionContext value={viewingVersion}>
        <AgentOrchestrateReadOnlyContext value={readOnly}>
          {workflowNodeId ? (
            <ReactFlowProvider>
              {throughPanel ? (
                <AgentOrchestratePanel
                  agentId="agent-1"
                  appId="workflow-1"
                  nodeId={workflowNodeId}
                  showHeader={false}
                  showPublishBar={false}
                  onSelectModel={() => {}}
                />
              ) : (
                <AgentKnowledgeRetrieval workflowNodeId={workflowNodeId} />
              )}
            </ReactFlowProvider>
          ) : (
            <AgentKnowledgeRetrieval />
          )}
        </AgentOrchestrateReadOnlyContext>
      </AgentOrchestrateViewingVersionContext>
      {showConfigSnapshot && <ConfigSnapshotPreview />}
    </AgentComposerProvider>,
  )
}

function getDialogNameEditButton(dialog: HTMLElement) {
  return within(dialog).getByRole('button', {
    name: /agentDetail\.configure\.knowledgeRetrieval\.edit/,
  })
}

vi.mock('@/context/permission-state', async () => {
  const { createPermissionStateModuleMock } = await import('@/test/console/state-fixture')

  return createPermissionStateModuleMock(() => ({
    workspacePermissionKeys: [],
  }))
})

describe('AgentKnowledgeRetrieval', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    datasetQuery.pages = []
    datasetQuery.error = null
  })

  describe('Rendering', () => {
    it('should render configured retrieval rows', () => {
      renderKnowledgeRetrieval()

      expect(
        screen.getByText('agentV2.agentDetail.configure.knowledgeRetrieval.retrievalOne'),
      ).toBeInTheDocument()
      expect(
        screen.queryByText('agentV2.agentDetail.configure.knowledgeRetrieval.retrievalTwo'),
      ).not.toBeInTheDocument()
    })

    it('should hide add, edit, and remove actions when viewing a version', () => {
      renderKnowledgeRetrieval({ readOnly: true, viewingVersion: true })

      expect(
        screen.getByText('agentV2.agentDetail.configure.knowledgeRetrieval.retrievalOne'),
      ).toBeInTheDocument()
      expect(
        screen.queryByRole('button', {
          name: 'agentV2.agentDetail.configure.knowledgeRetrieval.add',
        }),
      ).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', {
          name: 'agentV2.agentDetail.configure.knowledgeRetrieval.edit:{"name":"agentV2.agentDetail.configure.knowledgeRetrieval.retrievalOne"}',
        }),
      ).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', {
          name: 'agentV2.agentDetail.configure.knowledgeRetrieval.remove:{"name":"agentV2.agentDetail.configure.knowledgeRetrieval.retrievalOne"}',
        }),
      ).not.toBeInTheDocument()
    })

    it('should disable adding in a read-only composer', () => {
      renderKnowledgeRetrieval({ readOnly: true })

      expect(
        screen.getByRole('button', {
          name: 'agentV2.agentDetail.configure.knowledgeRetrieval.add',
        }),
      ).toBeDisabled()
    })
  })

  describe('User Interactions', () => {
    it('keeps KnowledgeFS bindings when editing a Classic retrieval', async () => {
      const user = userEvent.setup()
      renderKnowledgeRetrieval({
        showConfigSnapshot: true,
        initialDraft: {
          ...agentKnowledgeDraft,
          knowledgeRetrievals: [
            ...agentKnowledgeDraft.knowledgeRetrievals,
            { id: 'space-binding', controlSpaceId: 'space-1', name: 'KnowledgeFS docs' },
          ],
        },
      })
      await user.click(
        screen.getByRole('button', {
          name: 'agentV2.agentDetail.configure.knowledgeRetrieval.edit:{"name":"agentV2.agentDetail.configure.knowledgeRetrieval.retrievalOne"}',
        }),
      )
      const dialog = screen.getByRole('dialog')
      await user.click(getDialogNameEditButton(dialog))
      const name = within(dialog).getByRole('textbox', {
        name: /knowledgeRetrieval.dialog.nameLabel/,
      })
      await user.clear(name)
      await user.type(name, 'Classic docs{Enter}')
      const knowledge = JSON.parse(screen.getByLabelText('config snapshot').textContent ?? '{}')
      expect(knowledge.sets[0]).toMatchObject({ id: 'retrieval-1', name: 'Classic docs' })
      expect(knowledge.spaces).toEqual([
        expect.objectContaining({
          id: 'space-binding',
          control_space_id: 'space-1',
          name: 'KnowledgeFS docs',
        }),
      ])
    })

    it.each(['failed', 'missing'])(
      'preserves saved filters and allows recovery when dataset metadata is %s',
      async (result) => {
        const user = userEvent.setup()
        if (result === 'failed') datasetQuery.error = new Error('Dataset request failed')
        else datasetQuery.pages = [{ data: [] }]
        renderKnowledgeRetrieval({
          workflowNodeId: 'agent-node',
          showConfigSnapshot: true,
          initialDraft: {
            ...agentKnowledgeDraft,
            knowledgeRetrievals: [
              {
                id: 'retrieval-1',
                name: 'Guide retrieval',
                datasetRefs: [{ id: 'dataset-1', name: 'Guide knowledge' }],
                metadataFilterMode: MetadataFilteringModeEnum.manual,
                metadataFilteringConditions: {
                  logical_operator: LogicalOperator.and,
                  conditions: [
                    {
                      id: 'condition-1',
                      metadata_id: 'guide-metadata',
                      name: 'guide_item_id',
                      comparison_operator: ComparisonOperator.is,
                      value: '{{#start.item_input#}}',
                    },
                  ],
                },
              },
            ],
          },
        })
        await user.click(
          screen.getByRole('button', {
            name: 'agentV2.agentDetail.configure.knowledgeRetrieval.edit:{"name":"Guide retrieval"}',
          }),
        )
        expect(await screen.findByRole('alert')).toHaveTextContent('common.dynamicSelect.error')
        expect(
          screen.queryByRole('progressbar', { name: 'appApi.loading' }),
        ).not.toBeInTheDocument()
        expect(screen.getByLabelText('config snapshot')).toHaveTextContent('{{#start.item_input#}}')
        await user.click(screen.getByRole('button', { name: /metadata.options.manual.title/ }))
        await user.click(
          screen.getByRole('menuitemradio', { name: /metadata.options.disabled.title/ }),
        )
        expect(screen.getByLabelText('config snapshot')).toHaveTextContent('"mode":"disabled"')

        datasetQuery.error = null
        datasetQuery.pages = [
          {
            data: [
              {
                id: 'dataset-1',
                name: 'Guide knowledge',
                doc_metadata: [{ id: 'guide-metadata', name: 'guide_item_id', type: 'string' }],
              },
            ],
          },
        ]
        await user.click(screen.getByRole('button', { name: 'common.operation.retry' }))
        await act(async () => {
          datasetQuery.notify()
        })
        await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
        await user.click(
          await screen.findByRole('button', { name: /metadata.options.disabled.title/ }),
        )
        await user.click(
          screen.getByRole('menuitemradio', { name: /metadata.options.manual.title/ }),
        )
        await user.click(await screen.findByRole('button', { name: /metadata.panel.conditions/ }))
        expect(screen.getByRole('button', { name: 'Variable' })).toBeInTheDocument()
        expect(screen.getByText('item_input')).toBeInTheDocument()
        expect(screen.getByLabelText('config snapshot')).toHaveTextContent('{{#start.item_input#}}')
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      },
    )

    it.each([false, true])(
      'preserves saved metadata conditions while dataset definitions are loaded: %s',
      async (loaded) => {
        const user = userEvent.setup()
        if (loaded)
          datasetQuery.pages = [
            {
              data: [
                {
                  id: 'dataset-1',
                  name: 'Guide knowledge',
                  doc_metadata: [
                    { id: 'program-metadata', name: 'guide_program_id', type: 'string' },
                  ],
                },
              ],
            },
          ]
        const draft: AgentSoulConfigFormState = {
          ...agentKnowledgeDraft,
          knowledgeRetrievals: [
            {
              id: 'retrieval-1',
              name: 'Guide retrieval',
              datasetRefs: [{ id: 'dataset-1', name: 'Guide knowledge' }],
              metadataFilterMode: MetadataFilteringModeEnum.manual,
              metadataFilteringConditions: {
                logical_operator: LogicalOperator.and,
                conditions: [
                  {
                    id: 'condition-1',
                    metadata_id: 'program-metadata',
                    name: 'guide_program_id',
                    comparison_operator: ComparisonOperator.is,
                    value: '{{#start.item_input#}}',
                  },
                ],
              },
            },
          ],
        }
        renderKnowledgeRetrieval({
          initialDraft: draft,
          showConfigSnapshot: true,
          workflowNodeId: 'agent-node',
        })
        await user.click(
          screen.getByRole('button', {
            name: 'agentV2.agentDetail.configure.knowledgeRetrieval.edit:{"name":"Guide retrieval"}',
          }),
        )
        expect(screen.getByLabelText('config snapshot')).toHaveTextContent('{{#start.item_input#}}')
        if (loaded) {
          await user.click(screen.getByRole('button', { name: /metadata.panel.conditions/ }))
          expect(screen.getByText('guide_program_id')).toBeInTheDocument()
          await user.click(screen.getByRole('button', { name: /metadata.panel.add/ }))
          expect(screen.getAllByText('guide_program_id')).toHaveLength(2)
        } else {
          expect(screen.getByRole('progressbar', { name: 'appApi.loading' })).toBeInTheDocument()
          expect(
            screen.queryByRole('button', { name: /metadata.panel.conditions/ }),
          ).not.toBeInTheDocument()
        }
      },
    )

    it.each([
      ['string', 'item_input', ComparisonOperator.is],
      ['number', 'program_input', ComparisonOperator.equal],
    ] as const)(
      'waits for metadata before editing a saved %s variable',
      async (metadataType, variableName, comparisonOperator) => {
        const user = userEvent.setup()
        const value = `{{#start.${variableName}#}}`
        renderKnowledgeRetrieval({
          workflowNodeId: 'agent-node',
          showConfigSnapshot: true,
          initialDraft: {
            ...agentKnowledgeDraft,
            knowledgeRetrievals: [
              {
                id: 'retrieval-1',
                name: 'Guide retrieval',
                datasetRefs: [{ id: 'dataset-1', name: 'Guide knowledge' }],
                metadataFilterMode: MetadataFilteringModeEnum.manual,
                metadataFilteringConditions: {
                  logical_operator: LogicalOperator.and,
                  conditions: [
                    {
                      id: 'condition-1',
                      metadata_id: 'guide-metadata',
                      name: 'guide_item_id',
                      comparison_operator: comparisonOperator,
                      value,
                    },
                  ],
                },
              },
            ],
          },
        })
        await user.click(
          screen.getByRole('button', {
            name: 'agentV2.agentDetail.configure.knowledgeRetrieval.edit:{"name":"Guide retrieval"}',
          }),
        )
        expect(screen.getByRole('progressbar', { name: 'appApi.loading' })).toBeInTheDocument()
        expect(
          screen.queryByRole('button', { name: /metadata.panel.conditions/ }),
        ).not.toBeInTheDocument()
        expect(screen.getByLabelText('config snapshot')).toHaveTextContent(value)

        await act(async () => {
          datasetQuery.pages = [
            {
              data: [
                {
                  id: 'dataset-1',
                  name: 'Guide knowledge',
                  doc_metadata: [
                    { id: 'guide-metadata', name: 'guide_item_id', type: metadataType },
                  ],
                },
              ],
            },
          ]
          datasetQuery.notify()
        })

        await user.click(await screen.findByRole('button', { name: /metadata.panel.conditions/ }))
        expect(
          screen.queryByRole('progressbar', { name: 'appApi.loading' }),
        ).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Variable' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Constant' })).not.toBeInTheDocument()
        expect(screen.getByText(variableName)).toBeInTheDocument()
        expect(screen.getByLabelText('config snapshot')).toHaveTextContent(value)
      },
    )

    it.each([
      ['guide_program_id', 'program_input', 'item_input'],
      ['guide_item_id', 'item_input', 'program_input'],
    ])(
      'should save a matching workflow variable for %s through the configuration panel',
      async (metadataName, variableName, otherTypeVariable) => {
        const user = userEvent.setup()
        renderKnowledgeRetrieval({
          workflowNodeId: 'agent-node',
          showConfigSnapshot: true,
          throughPanel: true,
        })

        await user.click(
          screen.getByRole('button', {
            name: 'agentV2.agentDetail.configure.knowledgeRetrieval.add',
          }),
        )
        await user.click(
          screen.getByRole('button', {
            name: 'common.operation.add workflow.nodes.knowledgeRetrieval.knowledge',
          }),
        )
        await user.click(
          screen.getByRole('button', {
            name: 'workflowModels.nodes.knowledgeRetrieval.metadata.options.disabled.title',
          }),
        )
        await user.click(
          screen.getByRole('menuitemradio', { name: /metadata.options.manual.title/ }),
        )
        await user.click(screen.getByRole('button', { name: /metadata.panel.conditions/ }))
        await user.click(
          screen.getByRole('button', {
            name: 'workflowModels.nodes.knowledgeRetrieval.metadata.panel.add',
          }),
        )
        await user.click(screen.getByText(metadataName))
        await user.click(screen.getByRole('button', { name: 'Constant' }))
        await user.click(screen.getByText('Variable', { exact: true }))
        await user.click(
          screen.getByText('workflowModels.nodes.knowledgeRetrieval.metadata.panel.select'),
        )

        expect(screen.queryByText(otherTypeVariable)).not.toBeInTheDocument()
        await user.click(screen.getByText(variableName))
        expect(screen.getByLabelText('config snapshot')).toHaveTextContent(
          `{{#start.${variableName}#}}`,
        )
        expect(screen.getByLabelText('config snapshot')).toHaveTextContent(metadataName)
      },
    )

    it('should open the knowledge retrieval dialog from the add button', async () => {
      const user = userEvent.setup()
      renderKnowledgeRetrieval()

      await user.click(
        screen.getByRole('button', {
          name: 'agentV2.agentDetail.configure.knowledgeRetrieval.add',
        }),
      )

      const dialog = screen.getByRole('dialog', {
        name: 'agentV2.agentDetail.configure.knowledgeRetrieval.dialog.title',
      })
      const titleButton = getDialogNameEditButton(dialog)
      expect(titleButton).toBeInTheDocument()
      expect(titleButton).toHaveTextContent(
        'agentV2.agentDetail.configure.knowledgeRetrieval.retrievalTwo',
      )
      expect(
        within(dialog).queryByRole('textbox', {
          name: 'agentV2.agentDetail.configure.knowledgeRetrieval.dialog.nameLabel',
        }),
      ).not.toBeInTheDocument()

      await user.click(titleButton)

      expect(
        within(dialog).getByRole('textbox', {
          name: 'agentV2.agentDetail.configure.knowledgeRetrieval.dialog.nameLabel',
        }),
      ).toHaveValue('agentV2.agentDetail.configure.knowledgeRetrieval.retrievalTwo')
      expect(
        within(dialog).queryByText('appDebug.datasetConfig.knowledgeTip'),
      ).not.toBeInTheDocument()
      expect(
        within(dialog).getByRole('button', {
          name: 'common.operation.add workflow.nodes.knowledgeRetrieval.knowledge',
        }),
      ).toBeInTheDocument()
      expect(
        within(dialog).getByRole('button', {
          name: 'workflowModels.nodes.knowledgeRetrieval.metadata.options.disabled.title',
        }),
      ).toBeInTheDocument()
      expect(
        screen.queryByRole('button', {
          name: 'agentV2.agentDetail.configure.knowledgeRetrieval.edit:{"name":"agentV2.agentDetail.configure.knowledgeRetrieval.retrievalTwo"}',
        }),
      ).not.toBeInTheDocument()
    })

    it('should show the custom query input when query mode changes', async () => {
      const user = userEvent.setup()
      renderKnowledgeRetrieval()

      await user.click(
        screen.getByRole('button', {
          name: 'agentV2.agentDetail.configure.knowledgeRetrieval.add',
        }),
      )
      const dialog = screen.getByRole('dialog', {
        name: 'agentV2.agentDetail.configure.knowledgeRetrieval.dialog.title',
      })

      await user.click(
        within(dialog).getByRole('radio', {
          name: 'agentV2.agentDetail.configure.knowledgeRetrieval.dialog.query.custom',
        }),
      )

      const customQueryInput = within(dialog).getByRole('textbox', {
        name: 'agentV2.agentDetail.configure.knowledgeRetrieval.dialog.query.customInputLabel',
      })
      await user.type(customQueryInput, 'release notes')

      expect(customQueryInput).toHaveValue('release notes')
      expect(
        within(dialog).getByPlaceholderText(
          'agentV2.agentDetail.configure.knowledgeRetrieval.dialog.query.customPlaceholder',
        ),
      ).toBeInTheDocument()
      expect(
        within(dialog).getByText(
          'agentV2.agentDetail.configure.knowledgeRetrieval.dialog.query.customDescription',
        ),
      ).toBeInTheDocument()
      expect(
        within(dialog).queryByText(
          'agentV2.agentDetail.configure.knowledgeRetrieval.dialog.query.agentDescription',
        ),
      ).not.toBeInTheDocument()
    })

    it('should not create a new retrieval until knowledge is selected', async () => {
      const user = userEvent.setup()
      renderKnowledgeRetrieval()

      await user.click(
        screen.getByRole('button', {
          name: 'agentV2.agentDetail.configure.knowledgeRetrieval.add',
        }),
      )

      await user.click(screen.getByRole('button', { name: 'common.operation.close' }))

      expect(
        screen.queryByRole('button', {
          name: 'agentV2.agentDetail.configure.knowledgeRetrieval.edit:{"name":"agentV2.agentDetail.configure.knowledgeRetrieval.retrievalTwo"}',
        }),
      ).not.toBeInTheDocument()
    })

    it('should show inline validation for blank custom queries after knowledge is selected', async () => {
      const user = userEvent.setup()
      renderKnowledgeRetrieval()

      await user.click(
        screen.getByRole('button', {
          name: 'agentV2.agentDetail.configure.knowledgeRetrieval.add',
        }),
      )
      const dialog = screen.getByRole('dialog', {
        name: 'agentV2.agentDetail.configure.knowledgeRetrieval.dialog.title',
      })

      await user.click(
        within(dialog).getByRole('button', {
          name: 'common.operation.add workflow.nodes.knowledgeRetrieval.knowledge',
        }),
      )

      await user.click(
        within(dialog).getByRole('radio', {
          name: 'agentV2.agentDetail.configure.knowledgeRetrieval.dialog.query.custom',
        }),
      )

      expect(
        within(dialog).getByText(
          'common.errorMsg.fieldRequired:{"field":"agentV2.agentDetail.configure.knowledgeRetrieval.dialog.query.customInputLabel"}',
        ),
      ).toBeInTheDocument()
    })

    it('should not show inline validation for automatic metadata filtering without a model', async () => {
      const user = userEvent.setup()
      renderKnowledgeRetrieval({
        initialDraft: {
          ...defaultAgentSoulConfigFormState,
          knowledgeRetrievals: [
            {
              id: 'retrieval-1',
              name: 'Docs Search',
              datasetRefs: [{ id: 'dataset-1', name: 'Docs' }],
              metadataFilterMode: MetadataFilteringModeEnum.automatic,
            },
          ],
        },
      })

      await user.click(
        screen.getByRole('button', {
          name: 'agentV2.agentDetail.configure.knowledgeRetrieval.edit:{"name":"Docs Search"}',
        }),
      )

      const dialog = screen.getByRole('dialog', {
        name: 'agentV2.agentDetail.configure.knowledgeRetrieval.dialog.title',
      })

      expect(
        within(dialog).queryByText(
          'agentV2.agentDetail.configure.knowledgeRetrieval.validation.metadataModelRequired',
        ),
      ).not.toBeInTheDocument()
    })

    it('should show duplicate-name validation in the dialog', async () => {
      const user = userEvent.setup()
      renderKnowledgeRetrieval({
        initialDraft: {
          ...defaultAgentSoulConfigFormState,
          knowledgeRetrievals: [
            {
              id: 'retrieval-1',
              name: 'Docs Search',
              datasetRefs: [{ id: 'dataset-1', name: 'Docs' }],
            },
            {
              id: 'retrieval-2',
              name: 'FAQ Search',
              datasetRefs: [{ id: 'dataset-2', name: 'FAQ' }],
            },
          ],
        },
      })

      await user.click(
        screen.getByRole('button', {
          name: 'agentV2.agentDetail.configure.knowledgeRetrieval.edit:{"name":"FAQ Search"}',
        }),
      )

      const dialog = screen.getByRole('dialog', {
        name: 'agentV2.agentDetail.configure.knowledgeRetrieval.dialog.title',
      })

      await user.click(getDialogNameEditButton(dialog))
      const nameInput = within(dialog).getByRole('textbox', {
        name: 'agentV2.agentDetail.configure.knowledgeRetrieval.dialog.nameLabel',
      })
      await user.clear(nameInput)
      await user.type(nameInput, 'Docs Search')
      fireEvent.blur(nameInput)

      expect(
        within(dialog).getByText(
          'appDebug.varKeyError.keyAlreadyExists:{"key":"agentV2.agentDetail.configure.knowledgeRetrieval.dialog.nameLabel"}',
        ),
      ).toBeInTheDocument()
    })

    it('should save newly added retrieval data into the config snapshot', async () => {
      const user = userEvent.setup()
      renderKnowledgeRetrieval({ showConfigSnapshot: true })

      await user.click(
        screen.getByRole('button', {
          name: 'agentV2.agentDetail.configure.knowledgeRetrieval.add',
        }),
      )
      const dialog = screen.getByRole('dialog', {
        name: 'agentV2.agentDetail.configure.knowledgeRetrieval.dialog.title',
      })

      expect(getDialogNameEditButton(dialog)).toHaveTextContent(
        'agentV2.agentDetail.configure.knowledgeRetrieval.retrievalTwo',
      )

      await user.click(
        within(dialog).getByRole('radio', {
          name: 'agentV2.agentDetail.configure.knowledgeRetrieval.dialog.query.custom',
        }),
      )
      await user.type(
        within(dialog).getByRole('textbox', {
          name: 'agentV2.agentDetail.configure.knowledgeRetrieval.dialog.query.customInputLabel',
        }),
        'new release notes',
      )
      await user.click(
        within(dialog).getByRole('button', {
          name: 'common.operation.add workflow.nodes.knowledgeRetrieval.knowledge',
        }),
      )

      const knowledgeConfig = JSON.parse(
        screen.getByLabelText('config snapshot').textContent ?? '{}',
      )
      expect(knowledgeConfig.sets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'retrieval-1',
            name: 'agentV2.agentDetail.configure.knowledgeRetrieval.retrievalOne',
            datasets: [],
            query: {
              mode: 'generated_query',
            },
          }),
          expect.objectContaining({
            name: 'agentV2.agentDetail.configure.knowledgeRetrieval.retrievalTwo',
            datasets: [
              expect.objectContaining({
                id: 'dataset-2',
                name: 'Release Docs',
              }),
            ],
            query: {
              mode: 'user_query',
              value: 'new release notes',
            },
            retrieval: expect.objectContaining({
              mode: 'multiple',
              reranking_enable: true,
              reranking_mode: RerankingModeEnum.RerankingModel,
              reranking_model: {
                provider: 'rerank-provider',
                model: 'rerank-model',
              },
              top_k: 4,
            }),
          }),
        ]),
      )
    })

    it('should open the knowledge retrieval dialog from the edit button', async () => {
      const user = userEvent.setup()
      renderKnowledgeRetrieval()

      await user.click(
        screen.getByRole('button', {
          name: 'agentV2.agentDetail.configure.knowledgeRetrieval.edit:{"name":"agentV2.agentDetail.configure.knowledgeRetrieval.retrievalOne"}',
        }),
      )

      const dialog = screen.getByRole('dialog', {
        name: 'agentV2.agentDetail.configure.knowledgeRetrieval.dialog.title',
      })
      await user.click(getDialogNameEditButton(dialog))

      expect(
        within(dialog).getByRole('textbox', {
          name: 'agentV2.agentDetail.configure.knowledgeRetrieval.dialog.nameLabel',
        }),
      ).toHaveValue('agentV2.agentDetail.configure.knowledgeRetrieval.retrievalOne')
    })

    it('should show hydrated backend datasets in the edit dialog', async () => {
      const user = userEvent.setup()
      renderKnowledgeRetrieval({
        initialDraft: {
          ...defaultAgentSoulConfigFormState,
          knowledgeRetrievals: [
            {
              id: 'dataset-1',
              name: 'Search Docs',
              datasetRefs: [
                {
                  id: 'dataset-1',
                  name: 'Product Docs',
                  description: 'Docs corpus',
                },
              ],
            },
          ],
        },
      })

      await user.click(
        screen.getByRole('button', {
          name: 'agentV2.agentDetail.configure.knowledgeRetrieval.edit:{"name":"Search Docs"}',
        }),
      )

      const dialog = screen.getByRole('dialog', {
        name: 'agentV2.agentDetail.configure.knowledgeRetrieval.dialog.title',
      })

      expect(within(dialog).getByText('Product Docs')).toBeInTheDocument()
      expect(
        within(dialog).queryByText('appDebug.datasetConfig.knowledgeTip'),
      ).not.toBeInTheDocument()
    })

    it('should preserve retrieval settings when renaming a retrieval', async () => {
      const user = userEvent.setup()
      renderKnowledgeRetrieval({
        showConfigSnapshot: true,
        initialDraft: {
          ...defaultAgentSoulConfigFormState,
          knowledgeRetrievals: [
            {
              id: 'retrieval-1',
              name: 'Search Docs',
              datasetRefs: [
                {
                  id: 'dataset-1',
                  name: 'Product Docs',
                  description: 'Docs corpus',
                },
              ],
              multipleRetrievalConfig: {
                top_k: 4,
                score_threshold: null,
                reranking_enable: false,
              },
            },
          ],
        },
      })

      await user.click(
        screen.getByRole('button', {
          name: 'agentV2.agentDetail.configure.knowledgeRetrieval.edit:{"name":"Search Docs"}',
        }),
      )

      const dialog = screen.getByRole('dialog', {
        name: 'agentV2.agentDetail.configure.knowledgeRetrieval.dialog.title',
      })
      await user.click(getDialogNameEditButton(dialog))
      const nameInput = within(dialog).getByRole('textbox', {
        name: 'agentV2.agentDetail.configure.knowledgeRetrieval.dialog.nameLabel',
      })
      await user.clear(nameInput)
      await user.type(nameInput, 'Renamed Docs{Enter}')

      const titleButton = getDialogNameEditButton(dialog)
      expect(titleButton).toHaveTextContent('Renamed Docs')
      expect(titleButton).toHaveFocus()
      const knowledgeConfig = JSON.parse(
        screen.getByLabelText('config snapshot').textContent ?? '{}',
      )
      expect(knowledgeConfig.sets[0]).toMatchObject({
        name: 'Renamed Docs',
        retrieval: {
          mode: 'multiple',
          reranking_enable: false,
          top_k: 4,
        },
      })
      expect(knowledgeConfig.sets[0].retrieval).not.toHaveProperty('reranking_model')
    })

    it('should cancel name editing with Escape without closing the dialog', async () => {
      const user = userEvent.setup()
      renderKnowledgeRetrieval({ showConfigSnapshot: true })

      await user.click(
        screen.getByRole('button', {
          name: 'agentV2.agentDetail.configure.knowledgeRetrieval.edit:{"name":"agentV2.agentDetail.configure.knowledgeRetrieval.retrievalOne"}',
        }),
      )
      const dialog = screen.getByRole('dialog', {
        name: 'agentV2.agentDetail.configure.knowledgeRetrieval.dialog.title',
      })
      await user.click(getDialogNameEditButton(dialog))
      const nameInput = within(dialog).getByRole('textbox', {
        name: 'agentV2.agentDetail.configure.knowledgeRetrieval.dialog.nameLabel',
      })
      await user.clear(nameInput)
      await user.type(nameInput, 'Draft name')
      await user.keyboard('{Escape}')

      expect(dialog).toBeInTheDocument()
      const titleButton = getDialogNameEditButton(dialog)
      expect(titleButton).toHaveTextContent(
        'agentV2.agentDetail.configure.knowledgeRetrieval.retrievalOne',
      )
      expect(titleButton).toHaveFocus()
      const knowledgeConfig = JSON.parse(
        screen.getByLabelText('config snapshot').textContent ?? '{}',
      )
      expect(knowledgeConfig.sets[0].name).toBe(
        'agentV2.agentDetail.configure.knowledgeRetrieval.retrievalOne',
      )
    })

    it('should keep editing when Enter confirms an IME composition', async () => {
      const user = userEvent.setup()
      renderKnowledgeRetrieval()

      await user.click(
        screen.getByRole('button', {
          name: 'agentV2.agentDetail.configure.knowledgeRetrieval.edit:{"name":"agentV2.agentDetail.configure.knowledgeRetrieval.retrievalOne"}',
        }),
      )
      const dialog = screen.getByRole('dialog', {
        name: 'agentV2.agentDetail.configure.knowledgeRetrieval.dialog.title',
      })
      await user.click(getDialogNameEditButton(dialog))
      const nameInput = within(dialog).getByRole('textbox', {
        name: 'agentV2.agentDetail.configure.knowledgeRetrieval.dialog.nameLabel',
      })

      fireEvent.keyDown(nameInput, { key: 'Enter', isComposing: true })

      expect(nameInput).toBeInTheDocument()
      expect(nameInput).toHaveFocus()
    })

    it('should save edited retrieval data into the config snapshot', async () => {
      const user = userEvent.setup()
      renderKnowledgeRetrieval({ showConfigSnapshot: true })

      await user.click(
        screen.getByRole('button', {
          name: 'agentV2.agentDetail.configure.knowledgeRetrieval.edit:{"name":"agentV2.agentDetail.configure.knowledgeRetrieval.retrievalOne"}',
        }),
      )
      const dialog = screen.getByRole('dialog', {
        name: 'agentV2.agentDetail.configure.knowledgeRetrieval.dialog.title',
      })

      await user.click(getDialogNameEditButton(dialog))
      const nameInput = within(dialog).getByRole('textbox', {
        name: 'agentV2.agentDetail.configure.knowledgeRetrieval.dialog.nameLabel',
      })
      await user.clear(nameInput)
      await user.type(nameInput, 'Release Search')
      await user.click(
        within(dialog).getByRole('radio', {
          name: 'agentV2.agentDetail.configure.knowledgeRetrieval.dialog.query.custom',
        }),
      )
      await user.type(
        within(dialog).getByRole('textbox', {
          name: 'agentV2.agentDetail.configure.knowledgeRetrieval.dialog.query.customInputLabel',
        }),
        'release notes',
      )

      const knowledgeConfig = JSON.parse(
        screen.getByLabelText('config snapshot').textContent ?? '{}',
      )
      expect(knowledgeConfig).toMatchObject({
        sets: [
          {
            id: 'retrieval-1',
            name: 'Release Search',
            datasets: [],
            query: {
              mode: 'user_query',
              value: 'release notes',
            },
            retrieval: {
              mode: 'multiple',
              top_k: 4,
            },
          },
        ],
      })
    })

    it('should remove the knowledge retrieval row from the remove button', async () => {
      const user = userEvent.setup()
      renderKnowledgeRetrieval()

      await user.click(
        screen.getByRole('button', {
          name: 'agentV2.agentDetail.configure.knowledgeRetrieval.remove:{"name":"agentV2.agentDetail.configure.knowledgeRetrieval.retrievalOne"}',
        }),
      )

      expect(
        screen.queryByText('agentV2.agentDetail.configure.knowledgeRetrieval.retrievalOne'),
      ).not.toBeInTheDocument()
      expect(
        within(
          screen.getByRole('region', {
            name: 'agentV2.agentDetail.configure.knowledgeRetrieval.label',
          }),
        ).getByText('agentV2.agentDetail.configure.knowledgeRetrieval.empty.title'),
      ).toBeInTheDocument()
    })
  })

  describe('Edge Cases', () => {
    it('should close the dialog from the close button', async () => {
      const user = userEvent.setup()
      renderKnowledgeRetrieval()

      await user.click(
        screen.getByRole('button', {
          name: 'agentV2.agentDetail.configure.knowledgeRetrieval.add',
        }),
      )
      await user.click(screen.getByRole('button', { name: 'common.operation.close' }))

      expect(
        screen.queryByRole('dialog', {
          name: 'agentV2.agentDetail.configure.knowledgeRetrieval.dialog.title',
        }),
      ).not.toBeInTheDocument()
    })

    it('should reset an uncreated dialog draft after closing', async () => {
      const user = userEvent.setup()
      renderKnowledgeRetrieval()

      await user.click(
        screen.getByRole('button', {
          name: 'agentV2.agentDetail.configure.knowledgeRetrieval.add',
        }),
      )
      let dialog = screen.getByRole('dialog', {
        name: 'agentV2.agentDetail.configure.knowledgeRetrieval.dialog.title',
      })
      await user.click(
        within(dialog).getByRole('radio', {
          name: 'agentV2.agentDetail.configure.knowledgeRetrieval.dialog.query.custom',
        }),
      )
      await user.type(
        within(dialog).getByRole('textbox', {
          name: 'agentV2.agentDetail.configure.knowledgeRetrieval.dialog.query.customInputLabel',
        }),
        'temporary query',
      )
      await user.click(within(dialog).getByRole('button', { name: 'common.operation.close' }))

      await user.click(
        screen.getByRole('button', {
          name: 'agentV2.agentDetail.configure.knowledgeRetrieval.add',
        }),
      )
      dialog = screen.getByRole('dialog', {
        name: 'agentV2.agentDetail.configure.knowledgeRetrieval.dialog.title',
      })
      expect(
        within(dialog).getByRole('radio', {
          name: 'agentV2.agentDetail.configure.knowledgeRetrieval.dialog.query.agent',
        }),
      ).toBeChecked()
      expect(
        within(dialog).queryByRole('textbox', {
          name: 'agentV2.agentDetail.configure.knowledgeRetrieval.dialog.query.customInputLabel',
        }),
      ).not.toBeInTheDocument()
    })
  })
})

const SPACE = '00000000-0000-4000-8000-000000000001'
const SECOND = '00000000-0000-4000-8000-000000000002'
const space = (
  id = SPACE,
  name = 'Product manual',
  available = true,
): KnowledgeFsSpaceListItemResponse => ({
  control_space_id: id,
  created_at: '2026-09-07T00:00:00Z',
  updated_at: '2026-09-07T00:00:00Z',
  knowledge_space_id: id,
  linked_apps: 0,
  owner_account_id: 'account',
  permission_keys: [
    'knowledge_space_read',
    'knowledge_space_query',
    'knowledge_space_access_config',
  ],
  resource_version: 1,
  state: 'active',
  technical_status: available ? 'available' : 'unavailable',
  visibility: 'only_me',
  technical_summary: {
    knowledge_space_id: id,
    name,
    description: 'A real knowledge space',
    revision: 1,
    slug: id,
  },
})
const binding = { id: 'docs', controlSpaceId: SPACE, name: 'Product manual' }

function Snapshot({ label = 'snapshot' }: { label?: string }) {
  const draft = useAtomValue(agentComposerDraftAtom)
  return (
    <output aria-label={label}>
      {JSON.stringify({
        prompt: draft.prompt,
        knowledge: formStateToAgentSoulConfig({ formState: draft }).knowledge,
      })}
    </output>
  )
}

function setup(
  bindings: AgentKnowledgeRetrievalItem[] = [],
  {
    enabled = true,
    viewingVersion = false,
    readOnly = false,
    label = 'snapshot',
    spaces = [space(), space(SECOND, 'Engineering')],
    hasMore = false,
  } = {},
) {
  const queryClient = createConsoleQueryClient()
  const options = consoleQuery.knowledgeFs.spaces.get.infiniteOptions({
    input: (pageParam) => ({ query: { limit: 50, page: pageParam } }),
    initialPageParam: 1,
    getNextPageParam: () => undefined,
  })
  queryClient.setQueryData(options.queryKey, {
    pages: [
      zKnowledgeFsSpaceListResponse.parse({ data: spaces, page: 1, limit: 50, has_more: hasMore }),
    ],
    pageParams: [1],
  })
  return render(
    <AgentComposerProvider
      initialDraft={{
        ...defaultAgentSoulConfigFormState,
        prompt: '[§knowledge:docs:Product manual§]',
        knowledgeRetrievals: bindings,
      }}
    >
      <AgentOrchestrateViewingVersionContext value={viewingVersion}>
        <AgentOrchestrateReadOnlyContext value={readOnly}>
          <AgentKnowledgeRetrieval />
        </AgentOrchestrateReadOnlyContext>
      </AgentOrchestrateViewingVersionContext>
      <Snapshot label={label} />
    </AgentComposerProvider>,
    { queryClient, knowledgeFsFeatures: { agent_enabled: enabled } },
  )
}
const snapshot = () => JSON.parse(screen.getByLabelText('snapshot').textContent ?? '{}')
const open = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: /knowledgeFs.add/ }))
  return screen.findByRole('dialog')
}

describe('KnowledgeFS composer interaction', () => {
  it('selects multiple real names and commits only on confirmation', async () => {
    const user = userEvent.setup()
    setup()
    const dialog = await open(user)
    await user.click(within(dialog).getByRole('checkbox', { name: 'Product manual' }))
    await user.click(within(dialog).getByRole('checkbox', { name: 'Engineering' }))
    expect(snapshot().knowledge.spaces).toEqual([])
    expect(within(dialog).queryByText(/retrievalSetting/)).not.toBeInTheDocument()
    expect(
      within(dialog).queryByRole('textbox', { name: /knowledgeFs.alias/ }),
    ).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: /operation.confirm/ }))
    expect(snapshot().knowledge.spaces.map((item: { name: string }) => item.name)).toEqual([
      'Product manual',
      'Engineering',
    ])
    expect(snapshot().knowledge.spaces[0].description).toBe('A real knowledge space')
    expect(snapshot().knowledge.sets).toEqual([])
  })

  it('keeps knowledge descriptions accessible without a separate help action', async () => {
    const user = userEvent.setup()
    setup([], { spaces: [space()] })
    const dialog = await open(user)
    const list = within(dialog).getByRole('group', { name: /knowledgeFs.select/ })
    expect(within(list).queryByRole('button')).not.toBeInTheDocument()
    const checkbox = within(list).getByRole('checkbox', { name: 'Product manual' })
    expect(checkbox).toHaveAccessibleDescription('A real knowledge space')
    await user.click(checkbox)
    expect(checkbox).toHaveAttribute('aria-checked', 'true')
    await user.click(within(dialog).getByRole('button', { name: /advancedSettings.label/ }))
    expect(within(dialog).getByRole('textbox', { name: /knowledgeFs.alias/ })).toHaveValue(
      'Product manual',
    )
    expect(
      within(dialog).getByRole('textbox', { name: /knowledgeFs.bindingDescription/ }),
    ).toHaveValue('A real knowledge space')
    expect(snapshot().knowledge.spaces).toEqual([])
  })

  it('limits Agent Knowledge Bases to 10 while retaining a Classic binding', async () => {
    const user = userEvent.setup()
    setup([{ id: 'classic', name: 'Classic Docs', datasetRefs: [{ id: 'dataset-1' }] }], {
      spaces: Array.from({ length: 11 }, (_, index) =>
        space(
          `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
          `Space ${index + 1}`,
        ),
      ),
    })
    const dialog = await open(user)
    for (let index = 1; index <= 10; index++) {
      await user.click(within(dialog).getByRole('checkbox', { name: `Space ${index}` }))
    }
    const search = within(dialog).getByRole('searchbox')
    await user.type(search, 'Space 11')
    expect(within(dialog).getByRole('checkbox', { name: 'Space 11' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    await user.clear(search)
    await user.click(within(dialog).getByRole('checkbox', { name: 'Space 1' }))
    await user.click(within(dialog).getByRole('checkbox', { name: 'Space 11' }))
    await user.click(within(dialog).getByRole('button', { name: /operation.confirm/ }))
    expect(snapshot().knowledge.spaces).toHaveLength(10)
    expect(snapshot().knowledge.sets).toHaveLength(1)
    expect(
      snapshot().knowledge.spaces.some((item: { name: string }) => item.name === 'Space 11'),
    ).toBe(true)
  })

  it('reveals invalid optional settings on submit without losing their draft', async () => {
    const user = userEvent.setup()
    setup([binding])
    const dialog = await open(user)
    const advanced = within(dialog).getByRole('button', { name: /advancedSettings.label/ })
    await user.click(advanced)
    await user.clear(within(dialog).getByRole('textbox', { name: /knowledgeFs.alias/ }))
    await user.click(advanced)
    await user.click(within(dialog).getByRole('button', { name: /operation.confirm/ }))
    expect(advanced).toHaveAttribute('aria-expanded', 'true')
    expect(within(dialog).getByRole('textbox', { name: /knowledgeFs.alias/ })).toHaveValue('')
    expect(within(dialog).getByRole('alert')).toBeInTheDocument()
    expect(snapshot().knowledge.spaces[0].name).toBe('Product manual')
  })

  it('discards cancelled edits and resets the next dialog draft', async () => {
    const user = userEvent.setup()
    setup([binding])
    let dialog = await open(user)
    await user.click(within(dialog).getByRole('button', { name: /advancedSettings.label/ }))
    const alias = within(dialog).getByRole('textbox', { name: /knowledgeFs.alias/ })
    await user.clear(alias)
    await user.type(alias, 'Unsaved')
    await user.click(within(dialog).getByRole('button', { name: /operation.cancel/ }))
    expect(snapshot().knowledge.spaces[0].name).toBe('Product manual')
    dialog = await open(user)
    expect(
      within(dialog).queryByRole('textbox', { name: /knowledgeFs.alias/ }),
    ).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: /advancedSettings.label/ }))
    expect(within(dialog).getByRole('textbox', { name: /knowledgeFs.alias/ })).toHaveValue(
      'Product manual',
    )
  })

  it('leaves the advanced settings focus indicator to the Collapsible primitive', async () => {
    const user = userEvent.setup()
    setup([binding])
    const dialog = await open(user)
    const advanced = within(dialog).getByRole('button', { name: /advancedSettings.label/ })
    expect(advanced.className.split(/\s+/)).not.toContain('outline-hidden')
  })

  it('renames a stable binding and its prompt reference, then removes it', async () => {
    const user = userEvent.setup()
    setup([binding])
    const dialog = await open(user)
    await user.click(within(dialog).getByRole('button', { name: /advancedSettings.label/ }))
    expect(within(dialog).queryByText(SPACE)).not.toBeInTheDocument()
    expect(within(dialog).queryByText(binding.id)).not.toBeInTheDocument()
    const alias = within(dialog).getByRole('textbox', { name: /knowledgeFs.alias/ })
    await user.clear(alias)
    await user.type(alias, 'Support docs')
    await user.click(within(dialog).getByRole('button', { name: /operation.confirm/ }))
    expect(snapshot().knowledge.spaces[0]).toMatchObject({ id: 'docs', name: 'Support docs' })
    expect(snapshot().prompt).toContain('Support docs')
    await user.click(screen.getByRole('button', { name: /knowledgeRetrieval.remove/ }))
    expect(snapshot().knowledge.spaces).toEqual([])
  })

  it('requires explicit rebind after import and explicit removal of legacy datasets', async () => {
    const user = userEvent.setup()
    setup([{ ...binding, isMissing: true }])
    const dialog = await open(user)
    await user.click(within(dialog).getByRole('button', { name: /operation.confirm/ }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(snapshot().knowledge.spaces[0].is_missing).toBe(true)
    await user.click(within(dialog).getByRole('checkbox', { name: 'Product manual' }))
    await user.click(within(dialog).getByRole('button', { name: /operation.confirm/ }))
    expect(snapshot().knowledge.spaces[0].is_missing).toBe(false)
  })

  it.each([
    'knowledge_space_read',
    'knowledge_space_query',
    'knowledge_space_access_config',
  ] as const)('hides spaces without %s even when filtering by name', async (permission) => {
    const user = userEvent.setup()
    const restricted = space(SECOND, 'Restricted')
    restricted.permission_keys = restricted.permission_keys.filter((key) => key !== permission)
    setup([], { spaces: [space(), restricted] })
    const dialog = await open(user)
    expect(within(dialog).getAllByRole('checkbox')).toHaveLength(1)
    expect(within(dialog).queryByText('Restricted')).not.toBeInTheDocument()
    await user.type(within(dialog).getByRole('searchbox'), 'Restricted')
    expect(within(dialog).queryByRole('checkbox')).not.toBeInTheDocument()
    expect(within(dialog).getByText(/knowledgeFs.empty/)).toBeVisible()
    expect(within(dialog).queryByText(/knowledgeFs.publishPermission/)).not.toBeInTheDocument()
  })

  it('hides unavailable and inactive spaces from the candidate list', async () => {
    const user = userEvent.setup()
    setup([], {
      spaces: [space(SPACE, 'Unavailable', false), { ...space(SECOND), state: 'deleting' }],
    })
    const dialog = await open(user)
    expect(within(dialog).queryByRole('checkbox')).not.toBeInTheDocument()
    expect(within(dialog).getByText(/knowledgeFs.empty/)).toBeVisible()
  })

  it.each(['forbidden', 'missing'] as const)(
    'preserves a %s existing binding until the user explicitly removes it',
    async (status) => {
      const user = userEvent.setup()
      setup([binding], {
        spaces: status === 'missing' ? [] : [{ ...space(), permission_keys: [] }],
      })
      const dialog = await open(user)
      expect(within(dialog).queryByRole('checkbox')).not.toBeInTheDocument()
      expect(snapshot().knowledge.spaces[0]).toMatchObject({ id: binding.id })
      await user.click(within(dialog).getByRole('button', { name: /operation.confirm/ }))
      expect(dialog).toBeInTheDocument()
      expect(within(dialog).getByRole('alert').textContent).toMatch(/knowledgeFs.unavailable/)
      const advanced = within(dialog).getByRole('button', { name: /advancedSettings.label/ })
      expect(advanced).toHaveAttribute('aria-expanded', 'true')
      expect(within(dialog).queryByText(SPACE)).not.toBeInTheDocument()
      await user.click(within(dialog).getByRole('button', { name: /knowledgeRetrieval.remove/ }))
      expect(snapshot().knowledge.spaces).toHaveLength(1)
      await user.click(within(dialog).getByRole('button', { name: /operation.confirm/ }))
      expect(snapshot().knowledge.spaces).toEqual([])
    },
  )

  it('does not infer lost permission from a partially loaded catalog', async () => {
    const user = userEvent.setup()
    setup([binding], { spaces: [space(SECOND, 'Engineering')], hasMore: true })
    const dialog = await open(user)
    expect(within(dialog).queryByText(/knowledgeFs.unavailable/)).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: /operation.confirm/ }))
    expect(snapshot().knowledge.spaces[0]).toMatchObject({ id: binding.id })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('rechecks refreshed permissions without dropping the in-progress selection', async () => {
    const user = userEvent.setup()
    const { queryClient } = setup([], { spaces: [space()] })
    const dialog = await open(user)
    await user.click(within(dialog).getByRole('checkbox', { name: 'Product manual' }))
    const options = consoleQuery.knowledgeFs.spaces.get.infiniteOptions({
      input: (pageParam) => ({ query: { limit: 50, page: pageParam } }),
      initialPageParam: 1,
      getNextPageParam: () => undefined,
    })
    const refresh = (spaces: KnowledgeFsSpaceListItemResponse[]) =>
      queryClient.setQueryData(options.queryKey, {
        pages: [
          zKnowledgeFsSpaceListResponse.parse({
            data: spaces,
            page: 1,
            limit: 50,
            has_more: false,
          }),
        ],
        pageParams: [1],
      })
    refresh([{ ...space(), permission_keys: ['knowledge_space_read', 'knowledge_space_query'] }])
    await waitFor(() => expect(within(dialog).queryByRole('checkbox')).not.toBeInTheDocument())
    await user.click(within(dialog).getByRole('button', { name: /operation.confirm/ }))
    expect(within(dialog).getByRole('alert').textContent).toMatch(/knowledgeFs.unavailable/)
    expect(within(dialog).getByRole('textbox', { name: /knowledgeFs.alias/ })).toHaveValue(
      'Product manual',
    )
    expect(snapshot().knowledge.spaces).toEqual([])
    refresh([space()])
    expect(await within(dialog).findByRole('checkbox', { name: 'Product manual' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await user.click(within(dialog).getByRole('button', { name: /operation.confirm/ }))
    expect(snapshot().knowledge.spaces[0]).toMatchObject({
      control_space_id: SPACE,
      name: 'Product manual',
    })
  })

  it('keeps Classic bindings when adding an Agent Knowledge Base', async () => {
    const user = userEvent.setup()
    setup([{ id: 'legacy', name: 'Old documents', datasetRefs: [{ id: 'dataset' }] }])
    const dialog = await open(user)
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
    expect(snapshot().knowledge.sets).toHaveLength(1)
    await user.click(within(dialog).getByRole('checkbox', { name: 'Product manual' }))
    await user.click(within(dialog).getByRole('button', { name: /operation.confirm/ }))
    expect(snapshot().knowledge.sets[0]).toMatchObject({
      id: 'legacy',
      datasets: [{ id: 'dataset' }],
    })
    expect(snapshot().knowledge.spaces).toHaveLength(1)
  })

  it('disables adding when server configuration is unavailable', () => {
    setup([], { enabled: false })
    expect(screen.getByRole('button', { name: /knowledgeFs.add/ })).toBeDisabled()
    expect(screen.getByText(/knowledgeFs.runtimeUnavailable/)).toBeInTheDocument()
  })

  it('does not offer additions when viewing a historical version', () => {
    setup([binding], { viewingVersion: true })
    expect(screen.queryByRole('button', { name: /knowledgeFs.add/ })).not.toBeInTheDocument()
  })

  it('keeps sibling composers isolated', async () => {
    const user = userEvent.setup()
    setup([binding], { label: 'first' })
    setup([], { label: 'second' })
    const firstAdd = screen.getAllByRole('button', { name: /knowledgeFs.add/ })[0]
    if (!firstAdd) throw new Error('First composer must expose an add button')
    await user.click(firstAdd)
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('checkbox', { name: 'Engineering' }))
    await user.click(within(dialog).getByRole('button', { name: /operation.confirm/ }))
    expect(
      JSON.parse(screen.getByLabelText('first').textContent ?? '{}').knowledge.spaces,
    ).toHaveLength(2)
    expect(
      JSON.parse(screen.getByLabelText('second').textContent ?? '{}').knowledge.spaces,
    ).toEqual([])
  })

  it('does not mutate a read-only composer', () => {
    setup([binding], { readOnly: true })
    expect(screen.getByRole('button', { name: /knowledgeFs.add/ })).toBeDisabled()
    expect(
      screen.queryByRole('button', { name: /knowledgeRetrieval.remove/ }),
    ).not.toBeInTheDocument()
  })

  it('rejects duplicate aliases at confirmation without changing the composer', async () => {
    const user = userEvent.setup()
    setup([binding])
    const dialog = await open(user)
    await user.click(within(dialog).getByRole('checkbox', { name: 'Engineering' }))
    await user.click(within(dialog).getByRole('button', { name: /advancedSettings.label/ }))
    const aliases = within(dialog).getAllByRole('textbox', { name: /knowledgeFs.alias/ })
    const secondAlias = aliases[1]
    if (!secondAlias) throw new Error('Second binding must expose an alias field')
    await user.clear(secondAlias)
    await user.type(secondAlias, 'Product manual')
    await user.click(within(dialog).getByRole('button', { name: /operation.confirm/ }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(within(dialog).getByRole('alert')).toBeInTheDocument()
    expect(snapshot().knowledge.spaces).toHaveLength(1)
  })
})
