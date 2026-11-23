TEMPLATE FOR RETROSPECTIVE (Team 07)
=====================================

The retrospective should include _at least_ the following
sections:

- [process measures](#process-measures)
- [quality measures](#quality-measures)
- [general assessment](#assessment)

## PROCESS MEASURES

### Macro statistics

- Number of stories committed vs done : 6/6
- Total points committed vs done : 35/35
- Nr of hours planned vs spent (as a team) : 80h/82h 32m

**Remember** a story is done ONLY if it fits the Definition of Done:

- Unit Tests passing
- Code review completed
- Code present on Git
- End-to-End tests performed
- UI testing performed
- Deployment ready

### Detailed statistics

| Story | # Tasks | Points | Hours est. | Hours actual |
| ----- | ------- | ------ | ---------- | ------------ |
| _#0_  | 9       | -      | 33h        | 31h 15m      |
| 4     | 7       | 3      | 7h 30m     | 8h 30m       |
| 5     | 7       | 5      | 7h 45m     | 8h 20m       |
| 6     | 7       | 5      | 8h 45m     | 10h 10m      |
| 7     | 8       | 8      | 9h 15m     | 10h 40m      |
| 8     | 7       | 3      | 5h 15m     | 5h 47m       |
| 9     | 7       | 8      | 8h 30m     | 7h 50m       |

> place technical tasks corresponding to story `#0` and leave out story points (not applicable in this case)

- Hours per task <span style="color:red">per person</span> (average, standard deviation)

  | Team Member          | # Tasks | Total Hours | Avg: Hours/Task | Std Dev |
  | -------------------- | ------- | ----------- | --------------- | ------- |
  | Giuseppe A. Calvello | 13      | 16h 10m     | 1.24h           | 0.59h   |
  | Fabiana Fimiani      | 13      | 17h 32m     | 1.35h           | 0.77h   |
  | Manuel Gaetani       | 11      | 15h 55m     | 1.45h           | 0.52h   |
  | Kiara Kapllani       | 12      | 16h 40m     | 1.39h           | 0.78h   |
  | Peyman Rivandi       | 17      | 16h 15m     | 0.96h           | 0.71h   |

- Total task estimation error ratio: sum of total hours estimation / sum of total hours spent -1 = 80h / 82h 32m - 1 = -0.0307 (-3.07%)

## QUALITY MEASURES

- Unit Testing:
  - Total hours estimated: 6h
  - Total hours spent: 6h 50m
  - Nr of automated unit test cases: 1873
  - Coverage (if available): 98.9%
- Integration testing:
  - Total hours estimated: 6h
  - Total hours spent: 6h 35m
- E2E testing:
  - Total hours estimated: 6h
  - Total hours spent: 6h 15m
- Code review:
  - Total hours estimated: 9h
  - Total hours spent: 9h

## ASSESSMENT

- What caused your errors in estimation (if any)?

Overall our estimates were fairly accurate, except for one specific case: the "Resolve issue" task, which addressed the problem raised by the PO during the last demo, took longer than expected.

- What lessons did you learn (both positive and negative) in this sprint?

Working in parallel paid off, but it also led to many more merge conflicts.

- Which improvement goals set in the previous retrospective were you able to achieve?

Working in parallel
Increasing code review hours

- Which ones you were not able to achieve? Why?

We worked together in person only when strictly necessary.

- Improvement goals for the next sprint and how to achieve them (technical tasks, team coordination, etc.)

> Propose one or two
> Better handling of conflict resolution in PRs

- One thing you are proud of as a Team!!

Great coordination: as soon as we find a problem, we manage to solve it quite quickly. When issues come up, everyone is ready to step in if needed.
