# Dawn Patrol — PM Conversation Prep

Live demo: **https://getdawnpatrol.vercel.app**

> Frame: **collaborator, not competitor.** You spotted a gap in the category and
> built a working prototype of the solution. You're someone they'd want on the team.

---

## 1. The one-liner

> "Surfline has the best ocean data in the world. Dawn Patrol is a prototype of the
> *translation layer* on top of it — turning a forecast into a personal go / no-go,
> tuned to your skill, board, and home break."

That sentence does the collaborator framing for you: you respect their core asset
(data) and point at an adjacent opportunity (personalization), not a replacement.

---

## 2. The 60-second pitch (say it out loud once before the call)

> "A 10-foot day is a dream for a pro and genuinely dangerous for a beginner — but
> the forecast they see is identical. The hardest part of surfing isn't getting the
> numbers, it's interpreting them for *yourself*. So I built Dawn Patrol: you tell it
> your skill, your board, and the biggest wave you're comfortable on, and it turns
> live swell/wind/tide data into one straight answer — GO, MARGINAL, or NOT WORTH IT —
> with the *why* in plain English. It's a deterministic scoring engine, fully tested,
> runs offline. I built it because this is exactly the kind of problem I'd love to work
> on at Surfline."

---

## 3. The demo walkthrough (the order that lands best)

1. **Open the live link on your phone**, share your screen.
2. **Set a profile** (skill, board, comfort) and hit *Get my call* — show the gauge,
   the verdict, the plain-English reasons, the best window.
3. **Tap "⚖️ Same wave, different surfer."** This is the money moment. Let it sit:
   > "Same wave, same hour, same break. Advanced surfer: GO SURF, 80. Beginner: NOT
   > WORTH IT, 11. One engine, personalized inputs."
4. **Tap the week strip** to show the 7-day outlook re-scoring per day.
5. (Optional) **Share button** → show the clean shareable summary.

Keep it under ~4 minutes. Let the comparison screen be the thing they remember.

---

## 4. Product decisions worth name-dropping (this signals PM thinking)

- **Deterministic core.** The verdict never depends on the network or an LLM — that's
  what makes it testable and trustworthy. (81 passing unit tests.)
- **Stoke-optimistic but safety-aware.** Leans toward GO on borderline *quality* calls,
  but hard-warns when size is over the surfer's skill ceiling. A real product judgment.
- **Honest about uncertainty.** Auto-estimated spot facing is labeled as estimated;
  offline shows a "stale" badge. No fake precision.
- **Local-first.** Works with zero backend; accounts/sync/alerts are progressive
  enhancement, not a dependency.
- **Free, no scraping.** Built only on free public data (Open-Meteo, NOAA). No Surfline
  data, by design — legal *and* strategic.

---

## 5. Questions to ASK the PM (turn it into a conversation, not a sales pitch)

Asking good questions matters more than a perfect pitch. A few:

- "How does Surfline think about personalization today — is the forecast deliberately
  one-size-fits-all, or is tailoring it something the team has explored?"
- "When you ship a forecasting feature, how do you measure whether it actually helped
  someone make a better call? What's the success metric for 'trust'?"
- "Where's the hardest tension between giving people more data vs. giving them a
  clearer answer?"
- "What does the PM role look like day-to-day on the forecasting side — how close are
  you to the data science and the surfers?"
- "What's a product bet Surfline made that surprised you in how it played out?"

---

## 6. Tough questions — and honest answers

**"How is this different from our premium forecast?"**
> "It's not trying to be the forecast — it's a decision layer on top of one. You own the
> data and the brand. The piece I got curious about is translating it per-person."

**"Why would this live in a free app instead of our subscription?"**
> "I built it free to learn and to get it in front of people fast. In a real product the
> personalization could be a premium feature — it's the kind of thing people *would* pay
> for because it saves them a wasted dawn drive."

**"What about liability — telling a beginner to paddle out?"**
> "That's why the core is conservative on size and shows a prominent hazard warning past
> someone's skill ceiling, plus a persistent 'this is guidance, not a safety device'
> disclaimer. I treated safety as a product constraint, not an afterthought."

**"What would you build next if this were real?"**
> "Pre-dawn alerts — 'your spot crosses your worth-it threshold tomorrow, best 6–8am.'
> That's the habit loop. Then accounts/sync, then community spot data with trust tiers."

**"How accurate is it really?"**
> "The scoring is a transparent, tunable heuristic, not a black box — every factor is
> visible in the 'why.' It's an MVP; the next step is validating calls against buoy data
> and real surfer feedback to tune the weights."

---

## 7. Things to remember (tone & don'ts)

- **Lead with curiosity, not 'I'm here to fix your product.'** You admire Surfline;
  you got obsessed with one slice of the problem.
- **Don't trash Surfline.** Drop the "disrupting / beats Surfline" language entirely in
  conversation. The category leader earned their position.
- **It's a prototype — say so.** Confidence about the *thinking*, humility about the
  *polish*. PMs trust people who know the difference.
- **Talk about users, not features.** "The decider who just wants yes/no" lands better
  than a feature list.
- **Listen more than you pitch.** Let the demo do the talking, then ask about their world.
- **Have the link ready in the chat** so they can open it themselves afterward.

---

## 8. Your "why" (the story that ties it together)

Keep a 2-sentence version ready for "so tell me about yourself / why Surfline":
> "I surf, and I kept watching people — including me — stare at a forecast and not
> actually know what to do with it. Surfline is the company that could close that gap at
> scale, and I wanted to show I can think about that problem like a PM, not just talk
> about it."
