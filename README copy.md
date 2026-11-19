# EVA HUD — Version 5: Experimenter and data collection

## Start

```bash
python3 -m pip install -r requirements.txt
python3 app.py
```

- Participant: http://localhost:5001/
- Experimenter: http://localhost:5001/control

If port 5001 is already occupied, stop the earlier running version using Ctrl+C.

## Experiment workflow

1. Open the participant screen and controller in separate windows.
2. Enter participant name/ID, experiment date, optional notes, and select a task-list mode.
3. Click **START EXPERIMENT**. The participant HUD becomes visible, starting in **normal** mode with task 1 active.
4. Participant clicks a checkbox to complete the current task and advance; clicking the task text expands/collapses its details.
5. Controller clicks **TRIGGER EMERGENCY**. Participant clicks the red emergency banner to acknowledge the alert; the reaction time is recorded.
6. Click **STOP EXPERIMENT** to hide the participant HUD. Download event/summary CSV files, or find them in `data/`.

## What is recorded

- `*_events.csv`: timestamped trial start/stop, mode changes, each task completion, task-description toggles, blank-background clicks, and emergency acknowledgement.
- `*_summary.csv`: participant ID, date, notes, list-mode condition, separate normal/emergency click counts, progression clicks, other clicks, and the latest emergency reaction time.
- Event CSV is written after every event; summary CSV is written at acknowledgement and stop (and when notes are saved).
- **Progression clicks**: completing the current checklist task.
- **Other clicks**: expanding/collapsing the task description or clicking non-interactive background. These are a proxy for extra interaction effort, **not automatically errors**.
- **Acknowledgement clicks**: emergency banner; counted in total/emergency clicks but not in progression or other clicks.
- Reaction time starts when the participant browser first receives/renders the emergency state, and ends when the banner is clicked. Polling (~250 ms) and browser timing affect precision. It does not measure reaction from the experimenter's physical button press.
- The summary retains the **latest** acknowledgement reaction time; the event CSV preserves individual acknowledgements if multiple alerts occur.

## Customize tasks

Edit `static/js/tasks.js`. For a study with a different number of tasks, update the `max_steps` values in `app.py` under `/api/interaction` (currently 7 normal, 6 emergency).

## Notes / limitations

- No SolidWorks images are included; the existing circle placeholder remains.
- Single participant and single experimenter per server at a time.
- Trial data persists as CSV files; the current live trial state is held in memory and resets when the server restarts.
- Refreshing the participant browser during a trial preserves step progress from the server, but resets the browser's local timer and could disrupt a pending emergency reaction measurement. Avoid refreshing during trials.
- For privacy, use participant codes (e.g. P001) rather than real names when possible. The local server has no authentication; use only on a trusted private network and keep CSV files secure.
- Pilot-test timing and all controls before collecting real study data.
