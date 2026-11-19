// Edit task titles and instructions here. Each array is ordered by task sequence.
// These are simulated procedures for a human-factors study, not operational EVA guidance.
const TASKS = {
  normal: [
    { title: "Prep", details: ["Check suit status", "Gather lube gun and wipes", "Tether tools"] },
    { title: "Translate", details: ["Move to starboard solar array", "Tether to worksite"] },
    { title: "Inspect gimbal", details: ["Locate gimbal SP-GMB-042", "Check for wear or debris", "Confirm array is locked"] },
    { title: "Apply lubricant", details: ["Insert nozzle into bearing", "Apply 2–3 pumps", "Confirm visible coating"] },
    { title: "Cycle gimbal", details: ["Crew inside commands rotation", "Stay clear of moving parts"] },
    { title: "Wipe excess", details: ["Wipe off extra lubricant", "Bag used wipe"] },
    { title: "Verify and close", details: ["Verify smooth motion", "Stow tools", "Report task complete"] }
  ],
  emergency: [
    { title: "Impact detected", details: ["Review simulated impact alert"] },
    { title: "Check suit for damage", details: ["Review suit integrity indicators", "Check simulated pressure readings", "If suit damage is indicated, follow the study's E1 branch"] },
    { title: "Move out of keep-out zone", details: ["Identify highlighted keep-out zone"] },
    { title: "Secure tools", details: ["Confirm tools secured"] },
    { title: "Photo damage from safe distance", details: ["Record simulated damage image"] },
    { title: "Crew decides: abort or resume", details: ["Await simulated crew decision"] }
  ]
};
