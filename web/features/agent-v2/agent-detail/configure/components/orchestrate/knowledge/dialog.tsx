'use client'

import type { AgentKnowledgeDatasetConfig } from '@dify/contracts/api/console/agent/types.gen'
import type {
  DatasetDetailWithPartialMembersResponse,
  DatasetDocMetadataResponse,
} from '@dify/contracts/api/console/datasets/types.gen'
import type { KnowledgeFsSpaceListItemResponse } from '@dify/contracts/api/console/knowledge-fs/types.gen'
import type { ReactNode, RefObject } from 'react'
import type {
  MetadataFilteringCondition,
  MetadataFilteringModeEnum,
  MultipleRetrievalConfig,
  SingleRetrievalConfig,
} from '@/app/components/workflow/nodes/knowledge-retrieval/types'
import type { ModelConfig } from '@/app/components/workflow/types'
import type { AgentKnowledgeRetrievalItem } from '@/features/agent-v2/agent-composer/form-state'
import { Button } from '@langgenius/dify-ui/button'
import { Checkbox } from '@langgenius/dify-ui/checkbox'
import { cn } from '@langgenius/dify-ui/cn'
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from '@langgenius/dify-ui/collapsible'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogHeaderCloseButton,
  DialogTitle,
} from '@langgenius/dify-ui/dialog'
import { Field, FieldLabel } from '@langgenius/dify-ui/field'
import { IconButton } from '@langgenius/dify-ui/icon-button'
import { Infotip, InfotipContent, InfotipTrigger } from '@langgenius/dify-ui/infotip'
import { Input } from '@langgenius/dify-ui/input'
import { RadioGroup, RadioItem } from '@langgenius/dify-ui/radio-group'
import { Textarea } from '@langgenius/dify-ui/textarea'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { intersectionBy } from 'es-toolkit/compat'
import { useAtomValue } from 'jotai'
import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SearchInput } from '@/app/components/base/search-input'
import { IndexingType } from '@/app/components/datasets/create/step-two/hooks/use-indexing-config'
import { ModelTypeEnum } from '@/app/components/header/account-setting/model-provider-page/declarations'
import {
  useCurrentProviderAndModel,
  useModelListAndDefaultModelAndCurrentProviderAndModel,
} from '@/app/components/header/account-setting/model-provider-page/hooks'
import ClassicField from '@/app/components/workflow/nodes/_base/components/field'
import AddKnowledge from '@/app/components/workflow/nodes/knowledge-retrieval/components/add-dataset'
import DatasetList from '@/app/components/workflow/nodes/knowledge-retrieval/components/dataset-list'
import RetrievalConfig from '@/app/components/workflow/nodes/knowledge-retrieval/components/retrieval-config'
import {
  ComparisonOperator,
  LogicalOperator,
  MetadataFilteringVariableType,
  MetadataFilteringModeEnum as WorkflowMetadataFilteringModeEnum,
} from '@/app/components/workflow/nodes/knowledge-retrieval/types'
import { getMultipleRetrievalConfig } from '@/app/components/workflow/nodes/knowledge-retrieval/utils'
import { DATASET_DEFAULT } from '@/config'
import { useDocLink } from '@/context/i18n'
import {
  useKnowledgeValidationMessage,
  validateKnowledgeRetrievals,
} from '@/features/agent-v2/agent-composer/knowledge-validation'
import { agentComposerKnowledgeRetrievalsAtom } from '@/features/agent-v2/agent-composer/store-modules/knowledge'
import { ChunkingMode, DataSourceType } from '@/models/datasets'
import { consoleQuery } from '@/service/console'
import { RETRIEVE_METHOD, RETRIEVE_TYPE } from '@/types/app'
import { AgentMetadataFilter } from './metadata-filter'

type Props = {
  open: boolean
  initialBindings: AgentKnowledgeRetrievalItem[]
  onConfirm: (bindings: AgentKnowledgeRetrievalItem[]) => void
  onOpenChange: (open: boolean) => void
}

type FormProps = Omit<Props, 'open' | 'onOpenChange'> & {
  searchRef: RefObject<HTMLInputElement | null>
  onClose: () => void
}

const canBindSpace = (space: KnowledgeFsSpaceListItemResponse) =>
  space.state === 'active' &&
  space.technical_status === 'available' &&
  space.permission_keys.includes('knowledge_space_read') &&
  space.permission_keys.includes('knowledge_space_query') &&
  space.permission_keys.includes('knowledge_space_access_config')

function KnowledgeSpaceOption({
  space,
  checked,
  disabled,
  onCheckedChange,
}: {
  space: KnowledgeFsSpaceListItemResponse
  checked: boolean
  disabled: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  const { t } = useTranslation(['agentV2'])
  const id = useId()
  const name =
    space.technical_summary?.name || t(($) => $['agentDetail.configure.knowledgeFs.title'])
  const description = space.technical_summary?.description

  return (
    <div
      className={cn(
        'group/space flex h-14 min-w-0 items-center gap-2 rounded-lg px-2 transition-colors motion-reduce:transition-none',
        checked
          ? 'bg-state-accent-active'
          : 'focus-within:bg-state-base-hover hover:bg-state-base-hover',
      )}
    >
      <label
        htmlFor={id}
        className={cn(
          'flex h-full min-w-0 flex-1 items-center gap-3',
          disabled ? 'cursor-not-allowed' : 'cursor-pointer',
        )}
      >
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-lg border-[0.5px] border-divider-regular bg-components-panel-on-panel-item-bg text-text-secondary shadow-xs group-focus-within/space:text-text-accent group-hover/space:text-text-accent"
        >
          <span className="i-ri-book-open-line size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span
            id={`${id}-name`}
            className={cn(
              'block truncate system-sm-medium',
              disabled
                ? 'text-text-tertiary'
                : 'text-text-secondary group-focus-within/space:text-text-primary group-hover/space:text-text-primary',
            )}
          >
            {name}
          </span>
          {!!description && (
            <span className="grid grid-rows-[0fr] opacity-0 transition-[grid-template-rows,opacity] duration-150 group-focus-within/space:grid-rows-[1fr] group-focus-within/space:opacity-100 group-hover/space:grid-rows-[1fr] group-hover/space:opacity-100 motion-reduce:transition-none">
              <span
                id={`${id}-description`}
                className="min-h-0 truncate overflow-hidden system-xs-regular text-text-tertiary"
              >
                {description}
              </span>
            </span>
          )}
        </span>
        <Checkbox
          id={id}
          aria-labelledby={`${id}-name`}
          aria-describedby={description ? `${id}-description` : undefined}
          checked={checked}
          disabled={disabled}
          onCheckedChange={onCheckedChange}
        />
      </label>
    </div>
  )
}

/** Draft state lives as long as the dialog content: each opening starts from the saved bindings. */
function AgentKnowledgeRetrievalForm({
  initialBindings,
  onConfirm,
  onClose,
  searchRef,
}: FormProps) {
  const { t } = useTranslation(['agentV2'])
  const { t: tc } = useTranslation(['common'])
  const [draft, setDraft] = useState(initialBindings)
  const [filter, setFilter] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const validationMessage = useKnowledgeValidationMessage()
  const spacesQuery = useInfiniteQuery({
    ...consoleQuery.knowledgeFs.spaces.get.infiniteOptions({
      input: (pageParam) => ({ query: { limit: 50, page: pageParam } }),
      getNextPageParam: (lastPage) => (lastPage.has_more ? lastPage.page + 1 : undefined),
      initialPageParam: 1,
    }),
  })
  const spaces = spacesQuery.data?.pages.flatMap((page) => page.data) ?? []
  const spacesById = new Map(spaces.map((space) => [space.control_space_id, space]))
  const visibleSpaces = spaces.filter(
    (space) =>
      canBindSpace(space) &&
      (space.technical_summary?.name ?? '')
        .toLocaleLowerCase()
        .includes(filter.toLocaleLowerCase()),
  )
  // A later catalog page may contain a saved binding; absence is conclusive only
  // after a successful, complete listing. Never discard a binding on query refresh.
  const unavailableBindingIds = new Set(
    draft
      .filter((item) => {
        if (!item.controlSpaceId || item.isMissing) return false
        const space = spacesById.get(item.controlSpaceId)
        return space ? !canBindSpace(space) : spacesQuery.isSuccess && !spacesQuery.hasNextPage
      })
      .map((item) => item.id),
  )
  const validation = validateKnowledgeRetrievals(draft)
  const spaceCount = draft.filter((item) => item.controlSpaceId).length
  const update = (id: string, patch: Partial<AgentKnowledgeRetrievalItem>) =>
    setDraft((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  const toggle = (space: KnowledgeFsSpaceListItemResponse, checked: boolean) => {
    setDraft((current) => {
      const existing = current.find((item) => item.controlSpaceId === space.control_space_id)
      if (!checked) return current.filter((item) => item !== existing)
      if (!canBindSpace(space)) return current
      if (existing)
        return current.map((item) => (item === existing ? { ...item, isMissing: false } : item))
      if (current.filter((item) => item.controlSpaceId).length >= 10) return current
      const title =
        space.technical_summary?.name || t(($) => $['agentDetail.configure.knowledgeFs.title'])
      const name = current.some((item) => item.name?.toLowerCase() === title.toLowerCase())
        ? `${title.slice(0, 109)} (${space.control_space_id.slice(0, 8)})`
        : title.slice(0, 120)
      return [
        ...current,
        {
          id: crypto.randomUUID(),
          controlSpaceId: space.control_space_id,
          name,
          description: space.technical_summary?.description?.slice(0, 2000) ?? '',
          isMissing: false,
        },
      ]
    })
  }

  return (
    <form
      noValidate
      className="flex max-h-[80dvh] min-h-0 flex-col text-text-primary"
      onSubmit={(event) => {
        event.preventDefault()
        setSubmitted(true)
        if (validation.isValid && unavailableBindingIds.size === 0) onConfirm(draft)
        else setAdvancedOpen(true)
      }}
    >
      <DialogHeader>
        <div className="flex items-center gap-2">
          <DialogTitle>{t(($) => $['agentDetail.configure.knowledgeFs.title'])}</DialogTitle>
          <Infotip>
            <InfotipTrigger
              aria-label={t(($) => $['agentDetail.configure.knowledgeFs.description'])}
            />
            <InfotipContent>
              {t(($) => $['agentDetail.configure.knowledgeFs.description'])}
            </InfotipContent>
          </Infotip>
        </div>
        <DialogDescription>
          {t(($) => $['agentDetail.configure.knowledgeFs.select'])}
        </DialogDescription>
        <DialogHeaderCloseButton aria-label={tc(($) => $['operation.close'])} />
      </DialogHeader>
      <div className="shrink-0 px-6 pb-4">
        <SearchInput
          ref={searchRef}
          value={filter}
          onValueChange={setFilter}
          aria-label={t(($) => $['agentDetail.configure.knowledgeFs.filter'])}
        />
      </div>
      <div className="min-h-0 space-y-3 overflow-y-auto overscroll-contain px-4 pb-4 system-sm-regular">
        {draft.some((item) => item.isMissing) && (
          <p role="alert" className="px-2 system-xs-regular text-text-warning">
            {t(($) => $['agentDetail.configure.knowledgeFs.rebind'])}
          </p>
        )}
        {unavailableBindingIds.size > 0 && (
          <p role="alert" className="px-2 system-xs-regular text-text-warning">
            {t(($) => $['agentDetail.configure.knowledgeFs.unavailable'])}
          </p>
        )}
        {spacesQuery.isPending && (
          <div role="status" className="space-y-1">
            <span className="sr-only">
              {t(($) => $['agentDetail.configure.knowledgeFs.loading'])}
            </span>
            {Array.from({ length: 5 }, (_, index) => (
              <div
                key={index}
                aria-hidden
                className="flex h-14 items-center gap-3 px-2 motion-safe:animate-pulse"
              >
                <span className="size-8 rounded-lg bg-background-section" />
                <span className="h-4 w-1/2 rounded bg-background-section" />
              </div>
            ))}
          </div>
        )}
        {spacesQuery.isError && (
          <div role="alert" className="space-y-2 p-3 system-sm-regular text-text-destructive">
            <p>{t(($) => $['agentDetail.configure.knowledgeFs.loadError'])}</p>
            <Button onClick={() => void spacesQuery.refetch()} loading={spacesQuery.isFetching}>
              {t(($) => $['agentDetail.configure.knowledgeFs.retry'])}
            </Button>
          </div>
        )}
        {!spacesQuery.isPending && !spacesQuery.isError && visibleSpaces.length === 0 && (
          <p className="px-2 py-8 text-center system-sm-regular text-text-tertiary">
            {t(($) => $['agentDetail.configure.knowledgeFs.empty'])}
          </p>
        )}
        <fieldset className="min-w-0 space-y-1">
          <legend className="sr-only">
            {t(($) => $['agentDetail.configure.knowledgeFs.select'])}
          </legend>
          {visibleSpaces.map((space) => {
            const binding = draft.find((item) => item.controlSpaceId === space.control_space_id)
            const checked = !!binding && !binding.isMissing
            return (
              <KnowledgeSpaceOption
                key={space.control_space_id}
                space={space}
                checked={checked}
                disabled={!checked && !binding && spaceCount >= 10}
                onCheckedChange={(next) => toggle(space, next)}
              />
            )
          })}
        </fieldset>
        {spacesQuery.hasNextPage && (
          <Button
            className="ml-2"
            onClick={() => void spacesQuery.fetchNextPage()}
            loading={spacesQuery.isFetchingNextPage}
          >
            {t(($) => $['agentDetail.configure.knowledgeFs.loadMore'])}
          </Button>
        )}
        {draft.length > 0 && (
          <Collapsible
            open={advancedOpen}
            onOpenChange={setAdvancedOpen}
            className="border-t border-divider-subtle pt-2"
          >
            <CollapsibleTrigger className="group flex min-h-8 w-full touch-manipulation items-center justify-between gap-2 rounded-lg px-2.5 text-start system-sm-medium text-text-secondary select-none hover:bg-components-panel-on-panel-item-bg-hover hover:text-text-primary data-panel-open:text-text-primary">
              <span>
                {t(($) => $['agentDetail.configure.advancedSettings.label'])}{' '}
                <span className="system-xs-regular text-text-tertiary">
                  {tc(($) => $['label.optional'])}
                </span>
              </span>
              <span
                aria-hidden
                className="i-ri-arrow-right-s-line size-4 shrink-0 transition-transform group-data-panel-open:rotate-90 motion-reduce:transition-none"
              />
            </CollapsibleTrigger>
            <CollapsiblePanel>
              <div className="space-y-3 px-2 pt-3">
                {draft.map((item) => (
                  <fieldset
                    key={item.id}
                    className="min-w-0 space-y-3 rounded-xl bg-background-section p-3"
                  >
                    <legend className="sr-only">
                      {item.name || t(($) => $['agentDetail.configure.knowledgeFs.title'])}
                    </legend>
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate system-sm-medium">
                        {item.name || t(($) => $['agentDetail.configure.knowledgeFs.title'])}
                      </span>
                      <IconButton
                        aria-label={t(($) => $['agentDetail.configure.knowledgeRetrieval.remove'], {
                          name: item.name || t(($) => $['agentDetail.configure.knowledgeFs.title']),
                        })}
                        tone="destructive"
                        onClick={() =>
                          setDraft((current) => current.filter((row) => row.id !== item.id))
                        }
                      >
                        <span aria-hidden className="i-ri-delete-bin-line size-4" />
                      </IconButton>
                    </div>
                    {unavailableBindingIds.has(item.id) && (
                      <p className="system-xs-regular text-text-warning">
                        {t(($) => $['agentDetail.configure.knowledgeFs.unavailable'])}
                      </p>
                    )}
                    <Field invalid={submitted && !!validation.byId[item.id]?.name}>
                      <FieldLabel>
                        {t(($) => $['agentDetail.configure.knowledgeFs.alias'])}
                      </FieldLabel>
                      <Input
                        required
                        maxLength={120}
                        value={item.name ?? ''}
                        onChange={(event) => update(item.id, { name: event.target.value })}
                      />
                    </Field>
                    <Field>
                      <FieldLabel>
                        {t(($) => $['agentDetail.configure.knowledgeFs.bindingDescription'])}
                      </FieldLabel>
                      <Textarea
                        rows={3}
                        maxLength={2000}
                        value={item.description ?? ''}
                        onValueChange={(value) => update(item.id, { description: value })}
                      />
                    </Field>
                  </fieldset>
                ))}
              </div>
            </CollapsiblePanel>
          </Collapsible>
        )}
        {submitted && validation.firstIssue && (
          <p role="alert" className="px-2 system-xs-regular text-text-destructive">
            {validationMessage(validation.firstIssue.code)}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-divider-subtle px-6 py-4">
        <span role="status" className="mr-auto system-xs-medium text-text-tertiary tabular-nums">
          {spaceCount} / 10
        </span>
        <Button onClick={onClose}>{tc(($) => $['operation.cancel'])}</Button>
        <Button type="submit" variant="primary">
          {tc(($) => $['operation.confirm'])}
        </Button>
      </div>
    </form>
  )
}

/** The composer changes only on explicit confirmation. */
export function AgentKnowledgeRetrievalDialog({
  open,
  initialBindings,
  onConfirm,
  onOpenChange,
}: Props) {
  const searchRef = useRef<HTMLInputElement>(null)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent initialFocus={searchRef} className="w-144 overflow-hidden">
        <AgentKnowledgeRetrievalForm
          initialBindings={initialBindings}
          searchRef={searchRef}
          onConfirm={onConfirm}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

type KnowledgeRetrievalQueryMode = 'agent' | 'custom'
type MetadataFilteringConditions = {
  logical_operator: LogicalOperator
  conditions: MetadataFilteringCondition[]
}

type KnowledgeRetrievalDialogState = {
  customQuery: string
  metadataFilterMode: MetadataFilteringModeEnum
  metadataFilteringConditions: MetadataFilteringConditions
  metadataModelConfig?: ModelConfig
  multipleRetrievalConfig: MultipleRetrievalConfig
  name: string
  queryMode: KnowledgeRetrievalQueryMode
  retrievalMode: (typeof RETRIEVE_TYPE)[keyof typeof RETRIEVE_TYPE]
  selectedDatasets: DatasetDetailWithPartialMembersResponse[]
  singleRetrievalConfig?: SingleRetrievalConfig
}

type AgentClassicKnowledgeRetrievalDialogProps = {
  workflowNodeId?: string
  item?: AgentKnowledgeRetrievalItem
  initialName?: string
  onItemCreate?: (item: AgentKnowledgeRetrievalItem) => void
  onItemChange?: (item: AgentKnowledgeRetrievalItem) => void
  open: boolean
  onOpenChange: (open: boolean) => void
}

const queryModeOptions: KnowledgeRetrievalQueryMode[] = ['agent', 'custom']

const optionCardClassName = cn(
  'flex h-8 flex-1 items-center justify-center rounded-lg border border-components-option-card-option-border bg-components-option-card-option-bg px-3 py-2 text-center system-sm-regular text-text-secondary transition-colors',
  'hover:border-components-option-card-option-border-hover hover:bg-components-option-card-option-bg-hover',
  'focus-visible:ring-1 focus-visible:ring-state-accent-solid focus-visible:outline-hidden',
  'data-checked:border-[1.5px] data-checked:border-components-option-card-option-selected-border data-checked:bg-components-option-card-option-selected-bg data-checked:font-medium data-checked:text-text-primary data-checked:shadow-xs data-checked:shadow-shadow-shadow-3',
)

function KnowledgeRetrievalDialogIcon() {
  return (
    <span className="flex size-6 shrink-0 items-center justify-center rounded-md border-[0.5px] border-divider-subtle bg-util-colors-green-green-500 p-1 text-text-primary-on-surface shadow-md shadow-shadow-shadow-5">
      <span aria-hidden className="i-ri-book-open-line size-4" />
    </span>
  )
}

function DialogFormLabel({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <div
      id={id}
      className="flex min-h-6 items-center system-sm-semibold-uppercase text-text-secondary"
    >
      {children}
    </div>
  )
}

const createDefaultRetrievalConfig = (): MultipleRetrievalConfig => ({
  top_k: DATASET_DEFAULT.top_k,
  score_threshold: null,
  reranking_enable: false,
})

const createDefaultMetadataFilteringConditions = (): MetadataFilteringConditions => ({
  logical_operator: LogicalOperator.and,
  conditions: [],
})

const createDatasetFromRef = (
  dataset: AgentKnowledgeDatasetConfig,
  index: number,
): DatasetDetailWithPartialMembersResponse => {
  const id = dataset.id ?? dataset.name ?? `dataset-${index}`
  const name = dataset.name ?? id

  return {
    id,
    name,
    icon_info: {
      icon: '📙',
      icon_type: 'emoji',
      icon_background: '#FFF4ED',
      icon_url: '',
    },
    description: dataset.description ?? '',
    permission: 'all_team_members',
    data_source_type: DataSourceType.FILE,
    indexing_technique: IndexingType.QUALIFIED,
    created_by: '',
    author_name: null,
    created_at: 0,
    updated_by: '',
    updated_at: 0,
    app_count: 0,
    doc_form: ChunkingMode.text,
    document_count: 0,
    total_documents: 0,
    total_available_documents: 0,
    word_count: 0,
    provider: '',
    embedding_model: '',
    embedding_model_provider: '',
    embedding_available: false,
    retrieval_model_dict: {
      search_method: RETRIEVE_METHOD.semantic,
      reranking_enable: false,
      reranking_model: {
        reranking_provider_name: '',
        reranking_model_name: '',
      },
      top_k: DATASET_DEFAULT.top_k,
      score_threshold_enabled: false,
      score_threshold: 0,
    },
    tags: [],
    external_knowledge_info: {
      external_knowledge_id: '',
      external_knowledge_api_id: '',
      external_knowledge_api_name: '',
      external_knowledge_api_endpoint: '',
    },
    external_retrieval_model: {
      top_k: DATASET_DEFAULT.top_k,
      score_threshold: 0,
      score_threshold_enabled: false,
    },
    built_in_field_enabled: false,
    doc_metadata: [],
    chunk_structure: null,
    is_published: false,
    pipeline_id: null,
    runtime_mode: 'general',
    enable_api: false,
    is_multimodal: false,
  }
}

const getSelectedDatasets = (item?: AgentKnowledgeRetrievalItem) =>
  item?.selectedDatasets ?? item?.datasetRefs?.map(createDatasetFromRef) ?? []

const getDialogName = (
  item: AgentKnowledgeRetrievalItem | undefined,
  initialName: string | undefined,
  fallbackName: string,
) => item?.name ?? initialName ?? fallbackName

const createDialogState = (
  item: AgentKnowledgeRetrievalItem | undefined,
  initialName: string | undefined,
  fallbackName: string,
): KnowledgeRetrievalDialogState => ({
  customQuery: item?.customQuery ?? '',
  metadataFilterMode: item?.metadataFilterMode ?? WorkflowMetadataFilteringModeEnum.disabled,
  metadataFilteringConditions:
    item?.metadataFilteringConditions ?? createDefaultMetadataFilteringConditions(),
  metadataModelConfig: item?.metadataModelConfig,
  multipleRetrievalConfig: item?.multipleRetrievalConfig ?? createDefaultRetrievalConfig(),
  name: getDialogName(item, initialName, fallbackName),
  queryMode: item?.queryMode ?? 'agent',
  retrievalMode: item?.retrievalMode ?? RETRIEVE_TYPE.multiWay,
  selectedDatasets: getSelectedDatasets(item),
  singleRetrievalConfig: item?.singleRetrievalConfig,
})

const createMetadataCondition = ({
  id,
  name,
  type,
}: DatasetDocMetadataResponse): MetadataFilteringCondition => ({
  id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`,
  metadata_id: id,
  name,
  comparison_operator:
    type === MetadataFilteringVariableType.number
      ? ComparisonOperator.equal
      : ComparisonOperator.is,
})

function EditableKnowledgeRetrievalName({
  editLabel,
  inputLabel,
  invalid,
  name,
  onCommit,
}: {
  editLabel: string
  inputLabel: string
  invalid: boolean
  name: string
  onCommit: (name: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(name)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const restoreButtonFocusRef = useRef(false)

  useLayoutEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
      return
    }

    if (!restoreButtonFocusRef.current) return

    restoreButtonFocusRef.current = false
    const button = buttonRef.current
    if (!button) return

    const activeElement = button.ownerDocument.activeElement
    if (!activeElement || activeElement === button.ownerDocument.body)
      button.focus({ preventScroll: true })
  }, [editing])

  const finishEditing = (commit: boolean) => {
    if (commit) onCommit(draftName)
    else setDraftName(name)

    restoreButtonFocusRef.current = true
    setEditing(false)
  }

  if (editing) {
    return (
      <Input
        ref={inputRef}
        aria-label={inputLabel}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        className="h-7 min-w-0 flex-1 rounded-md px-1 py-0 system-xl-semibold text-text-primary"
        name="knowledgeRetrievalName"
        value={draftName}
        onBlur={() => {
          onCommit(draftName)
          setEditing(false)
        }}
        onChange={(event) => setDraftName(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return

          if (event.key === 'Enter') {
            event.preventDefault()
            finishEditing(true)
            return
          }

          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            finishEditing(false)
          }
        }}
      />
    )
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={editLabel}
      className="flex h-7 min-w-0 flex-1 items-center rounded-md border border-transparent px-1 py-0 text-left system-xl-semibold text-text-primary hover:bg-components-input-bg-hover focus-visible:border-components-input-border-active focus-visible:bg-components-input-bg-active focus-visible:shadow-xs focus-visible:ring-2 focus-visible:ring-state-accent-solid focus-visible:outline-hidden"
      onClick={() => {
        setDraftName(name)
        setEditing(true)
      }}
    >
      <span className="min-w-0 truncate">{name}</span>
    </button>
  )
}

function AgentClassicKnowledgeRetrievalDialogContent({
  workflowNodeId,
  item,
  initialName,
  onItemCreate,
  onItemChange,
}: Omit<AgentClassicKnowledgeRetrievalDialogProps, 'open' | 'onOpenChange'>) {
  const { t } = useTranslation(['agentV2', 'common', 'datasetSettings'])
  const docLink = useDocLink()
  const retrievals = useAtomValue(agentComposerKnowledgeRetrievalsAtom)
  const getValidationMessage = useKnowledgeValidationMessage()
  const fallbackName = t(($) => $['agentDetail.configure.knowledgeRetrieval.retrievalOne'])
  const [dialogState, setDialogState] = useState(() =>
    createDialogState(item, initialName, fallbackName),
  )
  const [unresolvedReferenceIds] = useState(
    () =>
      new Set(item?.selectedDatasets ? [] : getSelectedDatasets(item).map((dataset) => dataset.id)),
  )
  const [rerankModelOpen, setRerankModelOpen] = useState(false)
  const queryModeLabelId = 'agent-knowledge-retrieval-query-mode-label'
  const {
    customQuery,
    metadataFilterMode,
    metadataFilteringConditions,
    metadataModelConfig,
    multipleRetrievalConfig,
    name,
    queryMode,
    retrievalMode,
    selectedDatasets: storedDatasets,
    singleRetrievalConfig,
  } = dialogState
  // Saved Agent snapshots contain dataset references, not metadata definitions.
  // Load definitions before allowing MetadataTrigger to prune deleted fields.
  const unresolvedDatasetIds = storedDatasets
    .filter((dataset) => unresolvedReferenceIds.has(dataset.id))
    .map((dataset) => dataset.id)
  const {
    data: datasetPage,
    isPending: metadataPending,
    refetch: reloadMetadata,
  } = useQuery(
    consoleQuery.datasets.get.queryOptions({
      input: { query: { ids: unresolvedDatasetIds, page: 1, limit: 100 } },
      enabled: unresolvedDatasetIds.length > 0,
    }),
  )
  const selectedDatasets = useMemo(() => {
    const fetchedDatasets = new Map(
      datasetPage?.data.map((dataset) => [dataset.id, dataset] as const),
    )
    return storedDatasets.map((dataset) => {
      const definitions = fetchedDatasets.get(dataset.id)?.doc_metadata
      if (!unresolvedReferenceIds.has(dataset.id) || !definitions) return dataset
      return {
        ...dataset,
        doc_metadata: definitions,
      }
    })
  }, [storedDatasets, datasetPage, unresolvedReferenceIds])
  const selectedDatasetsLoaded = selectedDatasets.every(
    (dataset) =>
      !unresolvedReferenceIds.has(dataset.id) ||
      datasetPage?.data.some((fetched) => fetched.id === dataset.id && !!fetched.doc_metadata),
  )
  const { modelList: rerankModelList, defaultModel: rerankDefaultModel } =
    useModelListAndDefaultModelAndCurrentProviderAndModel(ModelTypeEnum.rerank)
  const { currentModel: currentRerankModel, currentProvider: currentRerankProvider } =
    useCurrentProviderAndModel(
      rerankModelList,
      rerankDefaultModel
        ? {
            ...rerankDefaultModel,
            provider: rerankDefaultModel.provider.provider,
          }
        : undefined,
    )
  const fallbackRerankModel = {
    provider: currentRerankProvider?.provider,
    model: currentRerankModel?.model,
  }
  const resolveMultipleRetrievalConfig = (
    config: MultipleRetrievalConfig,
    nextSelectedDatasets = selectedDatasets,
    originalDatasets = selectedDatasets,
  ) =>
    getMultipleRetrievalConfig(config, nextSelectedDatasets, originalDatasets, fallbackRerankModel)
  const effectiveMultipleRetrievalConfig =
    retrievalMode === RETRIEVE_TYPE.multiWay && selectedDatasets.length > 0
      ? resolveMultipleRetrievalConfig(multipleRetrievalConfig)
      : multipleRetrievalConfig
  const createItemFromDialogState = (
    state: KnowledgeRetrievalDialogState,
    id = globalThis.crypto?.randomUUID?.() ?? `retrieval-${Date.now()}`,
  ): AgentKnowledgeRetrievalItem => ({
    id,
    name: state.name,
    queryMode: state.queryMode,
    customQuery: state.customQuery,
    datasetRefs: state.selectedDatasets.map(({ id, name, description }) => ({
      id,
      name,
      description,
    })),
    selectedDatasets: state.selectedDatasets.every(
      (dataset) =>
        !unresolvedReferenceIds.has(dataset.id) ||
        datasetPage?.data.some((fetched) => fetched.id === dataset.id && !!fetched.doc_metadata),
    )
      ? state.selectedDatasets.map((dataset) => ({
          ...dataset,
          doc_metadata:
            datasetPage?.data.find((fetched) => fetched.id === dataset.id)?.doc_metadata ??
            dataset.doc_metadata,
        }))
      : undefined,
    retrievalMode: state.retrievalMode,
    multipleRetrievalConfig: state.multipleRetrievalConfig,
    singleRetrievalConfig: state.singleRetrievalConfig,
    metadataFilterMode: state.metadataFilterMode,
    metadataFilteringConditions: state.metadataFilteringConditions,
    metadataModelConfig: state.metadataModelConfig,
  })
  const applyDialogStatePatch = (patch: Partial<KnowledgeRetrievalDialogState>) => {
    const nextState = {
      ...dialogState,
      ...patch,
    }
    setDialogState(nextState)

    if (item) {
      onItemChange?.({
        ...item,
        ...createItemFromDialogState(nextState, item.id),
      })
    }

    return nextState
  }
  const handleSelectedDatasetsChange = (
    nextDatasets: DatasetDetailWithPartialMembersResponse[],
  ) => {
    const nextMultipleRetrievalConfig =
      retrievalMode === RETRIEVE_TYPE.multiWay && nextDatasets.length > 0
        ? resolveMultipleRetrievalConfig(multipleRetrievalConfig, nextDatasets)
        : multipleRetrievalConfig
    const nextState = applyDialogStatePatch({
      multipleRetrievalConfig: nextMultipleRetrievalConfig,
      selectedDatasets: nextDatasets,
    })

    if (item) return

    if (nextDatasets.length > 0) onItemCreate?.(createItemFromDialogState(nextState))
  }
  const metadataList = useMemo(() => {
    const datasetsWithMetadata = selectedDatasets.filter((dataset) => !!dataset.doc_metadata)

    if (datasetsWithMetadata.length === 0) return []

    return intersectionBy(...datasetsWithMetadata.map((dataset) => dataset.doc_metadata!), 'name')
  }, [selectedDatasets])
  const validation = useMemo(() => validateKnowledgeRetrievals(retrievals), [retrievals])
  const itemValidation = item ? validation.byId[item.id] : undefined
  const nameError = getValidationMessage(itemValidation?.name)
  const datasetsError = getValidationMessage(itemValidation?.datasets)
  const queryError = getValidationMessage(itemValidation?.query)
  const retrievalError = getValidationMessage(itemValidation?.retrieval)
  const metadataError =
    itemValidation?.metadata === 'metadata_model_required'
      ? undefined
      : getValidationMessage(itemValidation?.metadata)

  return (
    <>
      <DialogTitle className="sr-only">
        {t(($) => $['agentDetail.configure.knowledgeRetrieval.dialog.title'])}
      </DialogTitle>
      <div className="flex items-center gap-2 px-4 pt-3">
        <KnowledgeRetrievalDialogIcon />
        <EditableKnowledgeRetrievalName
          editLabel={t(($) => $['agentDetail.configure.knowledgeRetrieval.edit'], { name })}
          inputLabel={t(($) => $['agentDetail.configure.knowledgeRetrieval.dialog.nameLabel'])}
          invalid={!!nameError}
          name={name}
          onCommit={(nextName) => applyDialogStatePatch({ name: nextName })}
        />
        <DialogClose
          render={
            <IconButton
              aria-label={t(($) => $['operation.close'], { ns: 'common' })}
              size="lg"
              className="-my-0.5 shrink-0"
            >
              <span aria-hidden className="i-ri-close-line size-4" />
            </IconButton>
          }
        />
      </div>
      {nameError && (
        <div role="alert" className="px-4 pt-1 system-xs-regular text-text-destructive">
          {nameError}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-1 py-2">
        <div className="flex flex-col gap-1 px-4 py-2">
          <DialogFormLabel id={queryModeLabelId}>
            {t(($) => $['agentDetail.configure.knowledgeRetrieval.dialog.query.label'])}
          </DialogFormLabel>
          <RadioGroup<KnowledgeRetrievalQueryMode>
            aria-labelledby={queryModeLabelId}
            className="w-full gap-2"
            value={queryMode}
            onValueChange={(nextMode) => {
              if (nextMode) applyDialogStatePatch({ queryMode: nextMode })
            }}
          >
            {queryModeOptions.map((mode) => (
              <RadioItem<KnowledgeRetrievalQueryMode>
                key={mode}
                value={mode}
                nativeButton
                render={<button type="button" className={optionCardClassName} />}
              >
                <span className="min-w-0 truncate">
                  {t(($) => $[`agentDetail.configure.knowledgeRetrieval.dialog.query.${mode}`])}
                </span>
              </RadioItem>
            ))}
          </RadioGroup>
          {queryMode === 'custom' ? (
            <>
              <div className="pt-1">
                <Textarea
                  aria-label={t(
                    ($) =>
                      $['agentDetail.configure.knowledgeRetrieval.dialog.query.customInputLabel'],
                  )}
                  aria-invalid={queryError ? true : undefined}
                  className="h-20 resize-none rounded-lg px-3 py-2 system-sm-regular"
                  placeholder={t(
                    ($) =>
                      $['agentDetail.configure.knowledgeRetrieval.dialog.query.customPlaceholder'],
                  )}
                  value={customQuery}
                  onValueChange={(nextQuery) => applyDialogStatePatch({ customQuery: nextQuery })}
                />
              </div>
              <p className="system-xs-regular text-text-tertiary">
                {t(
                  ($) =>
                    $['agentDetail.configure.knowledgeRetrieval.dialog.query.customDescription'],
                )}
              </p>
              {queryError && (
                <p role="alert" className="system-xs-regular text-text-destructive">
                  {queryError}
                </p>
              )}
            </>
          ) : (
            <p className="pt-1 system-xs-regular text-text-tertiary">
              {t(
                ($) => $['agentDetail.configure.knowledgeRetrieval.dialog.query.agentDescription'],
              )}
            </p>
          )}
        </div>

        <div className="px-4 py-2">
          <ClassicField
            title={t(($) => $['agentDetail.configure.knowledgeRetrieval.dialog.knowledge.label'])}
            required
            operations={
              <div className="flex items-center space-x-1">
                <RetrievalConfig
                  payload={{
                    retrieval_mode: retrievalMode,
                    multiple_retrieval_config: effectiveMultipleRetrievalConfig,
                    single_retrieval_config: singleRetrievalConfig,
                  }}
                  onRetrievalModeChange={(nextRetrievalMode) => {
                    const nextMultipleRetrievalConfig =
                      nextRetrievalMode === RETRIEVE_TYPE.multiWay
                        ? resolveMultipleRetrievalConfig(multipleRetrievalConfig)
                        : multipleRetrievalConfig

                    applyDialogStatePatch({
                      multipleRetrievalConfig: nextMultipleRetrievalConfig,
                      retrievalMode: nextRetrievalMode,
                    })
                  }}
                  onMultipleRetrievalConfigChange={(nextMultipleRetrievalConfig) => {
                    const normalizedMultipleRetrievalConfig = resolveMultipleRetrievalConfig(
                      nextMultipleRetrievalConfig,
                    )

                    applyDialogStatePatch({
                      multipleRetrievalConfig: normalizedMultipleRetrievalConfig,
                    })
                  }}
                  singleRetrievalModelConfig={singleRetrievalConfig?.model}
                  onSingleRetrievalModelChange={(model) => {
                    applyDialogStatePatch({
                      singleRetrievalConfig: {
                        model: {
                          provider: model.provider,
                          name: model.modelId,
                          mode: model.mode ?? singleRetrievalConfig?.model.mode ?? 'chat',
                          completion_params: singleRetrievalConfig?.model.completion_params ?? {
                            temperature: 0.7,
                          },
                        },
                      },
                    })
                  }}
                  onSingleRetrievalModelParamsChange={(completionParams) => {
                    applyDialogStatePatch({
                      singleRetrievalConfig: {
                        model: {
                          provider: singleRetrievalConfig?.model.provider ?? '',
                          name: singleRetrievalConfig?.model.name ?? '',
                          mode: singleRetrievalConfig?.model.mode ?? 'chat',
                          completion_params: completionParams,
                        },
                      },
                    })
                  }}
                  readonly={!selectedDatasets.length}
                  modal
                  rerankModalOpen={rerankModelOpen}
                  onRerankModelOpenChange={setRerankModelOpen}
                  selectedDatasets={selectedDatasets}
                />
                <div className="h-3 w-px bg-divider-regular" />
                <AddKnowledge
                  selectedIds={selectedDatasets.map((dataset) => dataset.id)}
                  modal
                  onChange={handleSelectedDatasetsChange}
                />
              </div>
            }
          >
            <>
              {selectedDatasets.length > 0 && (
                <DatasetList
                  list={selectedDatasets}
                  onChange={handleSelectedDatasetsChange}
                  settingsDrawerBackdropClassName="bg-background-overlay"
                  settingsDrawerBackdropForceRender
                  settingsDrawerPopupClassName="data-[swipe-direction=right]:top-6 data-[swipe-direction=right]:bottom-6"
                  settingsModalHeight="100%"
                />
              )}
              {(datasetsError || retrievalError) && (
                <div role="alert" className="pt-2 system-xs-regular text-text-destructive">
                  {datasetsError ?? retrievalError}
                </div>
              )}
            </>
          </ClassicField>
        </div>

        <div className="py-2">
          <AgentMetadataFilter
            workflowNodeId={workflowNodeId}
            metadataList={metadataList}
            selectedDatasetsLoaded={selectedDatasetsLoaded}
            metadataUnavailable={!metadataPending && !selectedDatasetsLoaded}
            onRetryMetadata={() => {
              void reloadMetadata()
            }}
            metadataFilterMode={metadataFilterMode}
            metadataFilteringConditions={metadataFilteringConditions}
            handleMetadataFilterModeChange={(nextMode) =>
              applyDialogStatePatch({ metadataFilterMode: nextMode })
            }
            handleAddCondition={(metadataItem) => {
              applyDialogStatePatch({
                metadataFilteringConditions: {
                  ...metadataFilteringConditions,
                  conditions: [
                    ...metadataFilteringConditions.conditions,
                    createMetadataCondition(metadataItem),
                  ],
                },
              })
            }}
            handleRemoveCondition={(conditionId) => {
              applyDialogStatePatch({
                metadataFilteringConditions: {
                  ...metadataFilteringConditions,
                  conditions: metadataFilteringConditions.conditions.filter(
                    (condition) => condition.id !== conditionId,
                  ),
                },
              })
            }}
            handleToggleConditionLogicalOperator={() => {
              applyDialogStatePatch({
                metadataFilteringConditions: {
                  ...metadataFilteringConditions,
                  logical_operator:
                    metadataFilteringConditions.logical_operator === LogicalOperator.and
                      ? LogicalOperator.or
                      : LogicalOperator.and,
                },
              })
            }}
            handleUpdateCondition={(conditionId, nextCondition) => {
              applyDialogStatePatch({
                metadataFilteringConditions: {
                  ...metadataFilteringConditions,
                  conditions: metadataFilteringConditions.conditions.map((condition) =>
                    condition.id === conditionId ? nextCondition : condition,
                  ),
                },
              })
            }}
            metadataModelConfig={metadataModelConfig}
            handleMetadataModelChange={(model) => {
              applyDialogStatePatch({
                metadataModelConfig: {
                  provider: model.provider,
                  name: model.modelId,
                  mode: model.mode ?? metadataModelConfig?.mode ?? 'chat',
                  completion_params: metadataModelConfig?.completion_params ?? { temperature: 0.7 },
                },
              })
            }}
            handleMetadataCompletionParamsChange={(completionParams) => {
              applyDialogStatePatch({
                metadataModelConfig: {
                  provider: metadataModelConfig?.provider ?? '',
                  name: metadataModelConfig?.name ?? '',
                  mode: metadataModelConfig?.mode ?? 'chat',
                  completion_params: completionParams,
                },
              })
            }}
          />
          {metadataError && (
            <div role="alert" className="px-4 pt-2 system-xs-regular text-text-destructive">
              {metadataError}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 px-4 pb-4">
        <div aria-hidden className="h-2 w-8 border-b border-divider-regular" />
        <a
          href={docLink('/use-dify/knowledge/create-knowledge/setting-indexing-methods')}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-w-0 items-center gap-1 system-xs-regular text-text-tertiary hover:text-text-secondary hover:underline focus-visible:ring-2 focus-visible:ring-state-accent-solid focus-visible:outline-hidden"
        >
          <span aria-hidden className="i-ri-book-read-line size-3 shrink-0" />
          <span className="min-w-0 truncate">
            {t(($) => $['form.retrievalSetting.learnMore'], { ns: 'datasetSettings' })}
          </span>
        </a>
      </div>
    </>
  )
}

export function AgentClassicKnowledgeRetrievalDialog({
  workflowNodeId,
  item,
  initialName,
  onItemCreate,
  onItemChange,
  open,
  onOpenChange,
}: AgentClassicKnowledgeRetrievalDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        backdropProps={{ forceRender: true }}
        className="h-130 max-h-[calc(100dvh-2rem)] w-100 overflow-hidden"
      >
        <AgentClassicKnowledgeRetrievalDialogContent
          workflowNodeId={workflowNodeId}
          item={item}
          initialName={initialName}
          onItemCreate={onItemCreate}
          onItemChange={onItemChange}
        />
      </DialogContent>
    </Dialog>
  )
}
