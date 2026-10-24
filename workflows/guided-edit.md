---
name: guided-edit
description: "Guided entry for any niche: short briefing (0 to 5 questions), reference style when one is sent, suggested plan and Posso editar?, then the styled render with QA and the mini editor."
version: 1.1.0
steps:
  - id: brief
    agent: edit-briefing-guide
    task: run-edit-briefing
    creates:
      - edit-plan
      - client-profile
    on_failure: abort
  - id: reference
    agent: edit-briefing-guide
    task: extract-reference-style
    requires:
      - brief
    creates:
      - style-profile
    on_failure: continue
    meta:
      when: "input.reference != null"
  - id: render
    agent: retention-editor
    task: apply-reference-style
    requires:
      - brief
    creates:
      - edited-mp4
      - edit-spec
    on_failure: abort
  - id: qa
    agent: edit-qa-auditor
    task: audit-retention-edit
    requires:
      - render
    creates:
      - qa-report
    on_failure: retry
  - id: review
    agent: retention-editor
    task: review-edit-preview
    requires:
      - qa
    creates:
      - edit-feedback
    on_failure: continue
success_indicators:
  - at most 5 questions were asked, and at most 1 when the message was complete
  - a first-time person saw the short welcome once, before the first questions; a returning person or an ongoing session saw none
  - the plan ended in "Posso editar?" and the person confirmed it
  - the client profile and the edit style sit in the user's project, not in the squad
  - the final MP4 has a QA verdict of PASS or CONCERNS
on_failure: abort
---

## brief

The `edit-briefing-guide` reads what came (video, text, audio transcript, reference) and runs `cli.ts brief`. It asks only the missing questions, and "outro" is always open.

**First use.** `brief` records `first_use` in `state.json`. A project with no squad history (no `editai/`, or no brief and no profile saved), or a person who says it is the first time, gets the 7-line welcome in `welcome.md`: formats, text or audio or clicks, reference video or link, the mini editor, the final in Downloads. The agent shows it before the questions of the same round (or the plan), with no extra round. An ongoing session, a saved profile or a complete request gets no welcome and no question about it. Only when the project has open, never confirmed briefs is the person asked "É a primeira vez usando o squad?" (yes/no), and the answer opens the next round.

- **Claude Code:** `AskUserQuestion` with the payload in `questions-r<N>.ask.json`, at most 4 questions per call and 4 options per question. Claude Code adds "Other" by itself.
- **Other runtimes:** the numbered list in `questions-r<N>.md`, answered "1=2, 2=Outro: ...".

The yes/no question goes the same way: `AskUserQuestion` on Claude Code, numbered list ("1=1" or "1=2") elsewhere.

A client with a saved profile is first asked "Mesmo estilo da última vez?". The plan ends in "Posso editar?". On yes, `--confirm` saves `editai/profiles/<client>.json` and `edit.style.json` in the user's project.

## reference (when a reference came)

`cli.ts style-extract` measures the reference with editonny's helpers (subprocess, nothing copied), and the agent checks the profile against the contact sheet. `brief` already extracts a reference that came with the first message, so this step runs on its own only for a reference sent later. The plan names what the style cannot reproduce.

## render

The retention editor sets the eyes and mouth of the person's footage and runs `cli.ts style-apply <edit.style.json> <batch.json>`: a quick 540x960 draft, then the final with QA. Formats other than a talking head use their own template, with the plan's music mood, caption look and headline in the slots.

## qa

`cli.ts qa`, as in `retention-edit`. PASS or CONCERNS goes on; FAIL goes back to `render` with the field to change.

## review

The mini editor (`cli.ts preview <spec> --final-name "<Cliente> - <tema> - final"`) lets the person approve and finalize to Downloads. Stop it with `--stop`.
