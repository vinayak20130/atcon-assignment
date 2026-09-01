'use client';

export interface StageDraft {
  name: string;
  type: string;
  requiresScorecard: boolean;
  slaDays: string;
}

export const STAGE_TYPES = [
  'APPLIED',
  'SCREEN',
  'ASSESSMENT',
  'INTERVIEW',
  'OFFER',
  'HIRED',
  'REJECTED',
] as const;

export const DEFAULT_STAGES: StageDraft[] = [
  { name: 'Applied', type: 'APPLIED', requiresScorecard: false, slaDays: '' },
  { name: 'Screen', type: 'SCREEN', requiresScorecard: false, slaDays: '3' },
  { name: 'Technical Interview', type: 'INTERVIEW', requiresScorecard: true, slaDays: '5' },
  { name: 'Offer', type: 'OFFER', requiresScorecard: false, slaDays: '5' },
  { name: 'Hired', type: 'HIRED', requiresScorecard: false, slaDays: '' },
  { name: 'Rejected', type: 'REJECTED', requiresScorecard: false, slaDays: '' },
];

export function stagesToPayload(stages: StageDraft[]) {
  return stages.map((stage) => ({
    name: stage.name,
    type: stage.type,
    requiresScorecard: stage.requiresScorecard,
    slaDays: stage.slaDays ? Number(stage.slaDays) : null,
  }));
}

export function pipelineHasOutcomes(stages: StageDraft[]) {
  return stages.some((stage) => stage.type === 'HIRED') && stages.some((stage) => stage.type === 'REJECTED');
}

export function StageEditor({
  stages,
  onChange,
}: {
  stages: StageDraft[];
  onChange: (stages: StageDraft[]) => void;
}) {
  function update(index: number, patch: Partial<StageDraft>) {
    onChange(stages.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  return (
    <div className="stage-editor">
      {stages.map((stage, index) => (
        <div key={index} className="stage-row">
          <input
            required
            minLength={2}
            maxLength={60}
            value={stage.name}
            onChange={(event) => update(index, { name: event.target.value })}
          />
          <select value={stage.type} onChange={(event) => update(index, { type: event.target.value })}>
            {STAGE_TYPES.map((type) => (
              <option key={type} value={type}>
                {type.toLowerCase().replace('_', ' ')}
              </option>
            ))}
          </select>
          <label className="mini-check">
            <input
              type="checkbox"
              checked={stage.requiresScorecard}
              onChange={(event) => update(index, { requiresScorecard: event.target.checked })}
            />
            Scorecard
          </label>
          <input
            aria-label={`${stage.name} SLA days`}
            min={1}
            max={365}
            type="number"
            value={stage.slaDays}
            onChange={(event) => update(index, { slaDays: event.target.value })}
            placeholder="SLA"
          />
          <button
            type="button"
            className="btn btn-sm"
            disabled={stages.length <= 2}
            onClick={() => onChange(stages.filter((_, itemIndex) => itemIndex !== index))}
          >
            Remove
          </button>
        </div>
      ))}

      <button
        type="button"
        className="btn btn-sm"
        onClick={() =>
          onChange([...stages, { name: 'New stage', type: 'SCREEN', requiresScorecard: false, slaDays: '' }])
        }
      >
        Add stage
      </button>
    </div>
  );
}
