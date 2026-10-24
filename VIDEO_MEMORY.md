# Video Memory

> Persistent memory for EditAi. Stores learned facts about: tool auth status per environment, user's tool preferences, common failure patterns, successful prompt templates per project.

## Current state
- Max learned facts: 200
- Review interval: 30 days
- Conflict resolution: replace (newer wins)

## Learned facts

_(empty — populated automatically during pipeline runs)_

## User preferences

_(empty — captured from intent briefs over time)_

## Tool auth status

_(empty — populated by tool-router auth checks)_
