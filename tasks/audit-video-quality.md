---
name: audit-video-quality
description: "Measure master and clips. Write audit-report.md with PASS, CONCERNS or FAIL."
# squads.sh / AIOS contract (additive; the workflow binds the agent, responsavel mirrors that binding)
task: auditVideoQuality()
responsavel: "Video Quality Auditor"
responsavel_type: Agente
atomic_layer: Analysis
Entrada:
  - nome: master
    tipo: file
    obrigatorio: true
    descricao: "outputs/master.mp4, lipsynced.mp4 or composed.mp4"
  - nome: clips
    tipo: file
    obrigatorio: false
    descricao: "generated clips"
  - nome: pitfalls
    tipo: file
    obrigatorio: true
    descricao: "data/pitfalls-mitigations.yaml"
Saida:
  - nome: audit_report
    tipo: file
    obrigatorio: true
    descricao: "audit-report.md"
  - nome: quality_metrics
    tipo: file
    obrigatorio: true
    descricao: "quality-metrics.jsonl"
  - nome: handoff
    tipo: file
    obrigatorio: false
    descricao: "handoff.json"
Checklist:
  - "the report has an overall verdict PASS, CONCERNS or FAIL"
  - "one table row per MP4 audited"
  - "FAIL rows cite a pitfalls remediation"
  - "every number names its tool"
---

## Outcome
Measure master and clips. Write audit-report.md with PASS, CONCERNS or FAIL.

## Input

`outputs/master.mp4` or `outputs/lipsynced.mp4` or `outputs/composed.mp4`, clips, `data/pitfalls-mitigations.yaml`, optional `continuity-metrics.json`.

## Output

`audit-report.md`, `quality-metrics.jsonl`, optional `handoff.json`.

## Acceptance Criteria

* Report exists and contains an overall verdict PASS, CONCERNS or FAIL.
- Per-clip table has one row per MP4 audited.
- FAIL rows cite a pitfalls remediation.
- No numeric metric appears without a tool named next to it.
