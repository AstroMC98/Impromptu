# Script references: what the format playbooks are built on

Pods used to be written from two things: seven general bullets on writing for the ear, and one
paragraph of style. Everything else was left to the model. The format playbooks in
[app/craft.py](../../app/craft.py) add a third: how people who do a format well actually do it,
measured from published transcripts.

This note records the sources, what was measured, what went into each playbook, and what the
evidence does not cover.

## How the references are used

The transcripts are studied, not shipped.

- No transcript text is in the repo, in a prompt or in a pod. A playbook holds patterns and
  numbers in our own words.
- No playbook names a show or a person (a unit check enforces it). This follows the catalog's
  rule that formats are named after the format: a pod learns the craft and imitates nobody.
- `tools/script_references.py fetch <folder>` downloads the pages into a folder outside the
  repo, and `stats <folder>` re-measures them.

## Sources

| Set | Pages studied | Used for |
|---|---|---|
| Most-watched stage talks (ted.com playlist) | 7 talks, 1,200 to 3,100 words each | `talk` |
| Widely shared speeches (neil.blog) | 7 speeches, 1,800 to 4,000 words each | `talk`, `solo`, and the monologue rules in `talkshow` |
| Long-form interviews (The TED Interview, The Art of Manliness) | 5 + 2 episodes, 6,500 to 11,600 words each | `interview`, and the solo openings in `solo` |
| Late-night clips (The Tonight Show, via sozai.app) | 7 clips: 5 interviews, 2 games | `talkshow`, and the Talk show co-host mode |
| The Daily Show (happyscribe.com) | none: the site answers 403 to scripts | not used |
| Opening monologues (three late-night shows, via scrapsfromtheloft.com) | 3 monologues, 2,300 to 3,600 words each | `talkshow` |
| Desk pieces from a news-comedy show (Last Week Tonight, via scrapsfromtheloft.com) | 4 episodes, 4,200 to 6,300 words each | `talkshow` |
| Personal solo podcasts (The Mel Robbins Podcast via podscripts.co; the WarriorBabe show) | 2 episodes, 4,500 and 9,800 words | `solo` |
| Expert solo podcast (Mindscape) | 2 episodes, 20,000 and 25,000 words | measured, not yet used |

The first five rows are the links supplied at the start. The last four were found by searching
for what those lacked: monologues and solo podcasts.

## What was measured

Minutes assume 150 words a minute. Laughs are counted from the transcripts' own "(Laughter)" marks.

### One speaker on a stage (7 stage talks)

| Measure | Range across the talks |
|---|---|
| Sentence length, median | 10 to 17.5 words |
| Sentences of 6 words or fewer | 12% to 31% (the three liveliest: 23% to 31%) |
| Sentences of 30 words or more | 4% to 19% |
| Sentences that are questions | 3% to 12% |
| Laughs per minute, talks that use humour | 1.1, 1.7, 1.9 and 4.7 (the last is a comedy set) |
| First laugh, talks that use humour | at word 24 to 87, so within the first half minute |
| Laughs in the two gravest talks | 0 and 3 |

Read from the openings and closings:

- None of the seven opens by introducing the speaker or listing what is coming. Four open
  inside a story, two on a question to the room, one on a four-word greeting and a joke.
- Each has one handle for its idea that keeps coming back (a coined name, an object, a diagram).
- Five of the seven end by returning to their opening image or saying the idea once more in a
  balanced sentence. All seven stop within a sentence of it; thanks are two or four words.

### Long-form interviews (7 episodes measured)

| Measure | Range across the episodes |
|---|---|
| Host's share of the words | 21% to 35% |
| Host turn, median | 23 to 81 words |
| Host turns of 12 words or fewer | 11% to 33% |
| Host turns that end on a question | 14% to 44% |
| Guest turn, median | 32 to 222 words (five of seven: 129 or more) |
| Guest turn, 90th percentile | 189 to 493 words |

Read from the turns:

- A host turn is rarely a bare question. The usual shape is a reaction, then the guest's point
  said back in plainer words or the host's own observation, then a question or a statement the
  guest picks up.
- Hosts open the episode alone (about 290 words): the problem as the listener meets it, the
  guest, then what the conversation covers. The first question is about origin.
- Mid-episode moves that recur: "take a step back", and a scenario walked from start to finish.
- Hosts start turns with "So", "Yeah", "Right", "Okay".

### Late night (7 clips)

The clips have timestamps but no speaker labels, so they give rhythm, not who said what.

| Measure | Range across the clips |
|---|---|
| Utterance length, median, interviews | 6 to 21 words |
| Utterances of 5 words or fewer, interviews | 0% to 47% (four of five: 23% or more) |
| Utterance length, median, the word-guessing game | 3 words; 76% are 5 words or fewer |

Read from the clips: the host welcomes with a specific compliment, asks for the story from the
beginning, and reacts in a word or two while the guest tells it with the dialogue acted out. A
game gets its name and its rules in three or four sentences, then very short rounds. An expert
gets the plainest question first, and the host says the answer back in everyday words.

### Solo podcasts (2 personal episodes, 2 expert episodes)

| Measure | Personal | Expert |
|---|---|---|
| "You" and "your" per 100 words | 6.7 and 8.3 | 1.4 and 2.3 |
| "I", "my", "me" per 100 words | 3.3 and 3.7 | 1.6 and 1.8 |
| Sentence length, median | 9 and 13 words | 15 and 17 words |
| Sentences of 6 words or fewer | 33% and 24% | 14% |
| Sentences that are questions | 8% and 11% | 4% and 14% |
| Sentences that start like the one before | 9% and 8% | 2% |

These are counted on the transcript alone; the tool also counts some of each page's own text,
so its "you" figures come out about one lower.

Read from the personal episodes: the opening names the listener's feeling inside thirty
seconds, promises what they will feel by the end, and gives a numbered roadmap. Each point has
one everyday picture and returns to it. Points are announced by number. The host says the
listener's inner voice out loud and answers it, and heads off the reaction a hard truth will
get. The close is a warm line said straight to the listener and one goodbye.

A personal solo pod and a stage talk are different registers: the solo host says "you" three
times as often and uses shorter sentences.

### Monologues and desk pieces (3 monologues, 4 desk pieces)

Clips and quoted speakers are separated from the host by their speaker tags; two of the
monologues and one desk piece are tagged too loosely for the split to be trusted, so the
ranges below are from the four that are.

| Measure | Range |
|---|---|
| Host's run between clips, median | 120 to 624 words |
| Share of the words that are clips or quotes | 11% to 22% |
| Sentence length, median | 11 to 16 words |
| Sentences of 6 words or fewer | 20% to 30% |
| Sentences that are questions | 5% to 13% |
| Sentences that turn back to the point ("But", "And look", "Now", "Because") | 5 to 7 per 1,000 words, about one a minute |

Read from the pieces: the unit is evidence, then reaction, then the serious point. Recurring
joke shapes are the absurdly specific comparison, the question answered in one word, the quote
taken literally, and a sentence or two acted out in a voice. The strongest desk pieces invent
something ridiculous early and bring it back, bigger, as the finale. The show ends in one line.

## What changed in the scripts

Each template was written once before and once after, on the same one-line topic at five
minutes, script only (no audio). One run each, so read these as direction, not as proof.

| Template | Measure | Before | After | References |
|---|---|---|---|---|
| Idea breakdown | Expert's share of the words | 53% | 61% | 65% to 79% |
| Idea breakdown | Expert's longest turn | 32 words | 80 words | median 129+ |
| Idea breakdown | Host turns that end on a question | 47% | 8% | 14% to 44% |
| Idea breakdown | Strict host/expert alternation | every line | broken (12 and 11 turns in 30 lines) | |
| Talk show | Sidekick turns of 12 words or fewer | 0% | 38% | 23% to 47% of utterances are 5 words or fewer |
| Talk show | Sentence length, median | 12 words | 7 words | |
| Talk show | Running gag planted and paid off | no | yes | |

The stage talk, the inspirational talk and the solo pod moved less on the numbers; their
baseline scripts were already close on sentence rhythm.

### Longer segments for the interview format

A pair of hosts gets a 20-second segment: two lines, about 50 words a writer call. That forces
a ping-pong whatever the playbook says. Interview-format pods now write 40-second segments
(`SEGMENT_SECONDS` in app/craft.py). Same topic, playbook on in both:

| Measure | 20-second segments | 40-second segments | References |
|---|---|---|---|
| Expert's share of the words | 61% | 71% | 65% to 79% |
| Expert turn, median | 32 words | 71 words | 129+ in five of seven |
| Expert's longest turn | 85 words | 120 words | 90th percentile 189 to 493 |
| Host turns that end on a question | 25% | 20% | 14% to 44% |

The cost: on a live interview-format pod, a call-in or a restyle can wait one longer segment.

### Signing off once

On the last beat the writers used to say goodnight in its first segment and again in each one
after (two to five sign-off phrases a script). The writer is now told when the last beat is
not yet the final segment, and that the final segment is one goodbye from each host. Seven
scripts after the change, including one template with no playbook: each ends once.

### After the second round of sources

The talk show and the solo pod were written again with the playbooks refined from the
monologues, the desk pieces and the solo episodes.

| Template | Measure | Before the refinement | After | References |
|---|---|---|---|---|
| Solo pod | "You" and "your" per 100 words | not measured | 7.2 | 6.7 and 8.3 |
| Solo pod | Numbered points, each with its own picture | no | yes (three points: a dripping sponge, a fire alarm, an iron door) | |
| Talk show | An invented running gag that returns | a parking ticket | a named mascot on the desk | |

That talk-show run also opened on a statistic the one-line topic never gave it, and the solo
host claimed listener mail. The playbooks now say a joke's setup must be true, that numbers,
studies and quotes are never made up for one, and that a solo host never invents listener mail
or a survey.

### On a real article

Both were then written from a 2,900-word magazine article on the science of procrastination
instead of a one-line topic. Every number, year, study and named researcher in the two scripts
(12 lines in the talk show, 5 in the solo pod) was checked against the article: all of them are
in it. The solo host's "I see it in myself, and in almost everyone I love" replaced the
invented mail. The one embellishment found was a joke that turned the article's "for a long
time" into "six months".

With a dense source the talk show's sidekick had fewer tiny reactions (7% of turns at 12 words
or fewer, against 24% to 38% on the one-line topic): there was more to say, and the host said
it. One run each.

## Limits

- **The monologues are not typical ones.** All three are from nights of serious news, so they
  show how a host turns from a joke back to a point better than they show a light opening
  monologue. The laugh rate still rests on one comic's commencement address (2.2 a minute).
- **Solo pods rest on two episodes.** Both are self-improvement shows. The expert solo
  episodes were measured but feed no playbook yet (Science deep-dive is the template they
  would fit).
- **Laughs can't be counted in the desk pieces.** Those transcripts don't mark them.
- **Small samples.** Seven or eight pieces a format, chosen because they are popular.
- **English only.** The rhythm numbers are for English; a pod in another language still gets
  the playbook.
- **Developed answers are still shorter than the references.** Even at 40-second segments the
  expert's typical turn is 71 words against 129 and up.
- **"Say where it comes from" invites named sources.** In the test run the expert named a real
  researcher correctly, but a model asked to cite can also invent. Pods with Research on are
  the safer place for it.

## Not covered yet

Girl talk, Married couple chat, Masculine talk, Debate night, Science deep-dive and the eight
style presets have no playbook: there is no reference material behind them yet. Adding one is
a new entry in `PLAYBOOKS` and `FORMAT_OF`, after measuring sources for that format.
