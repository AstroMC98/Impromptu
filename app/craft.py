"""Format playbooks: how a good episode of a format is built and how it sounds.

A style paragraph says what a show feels like; a playbook says how the people who do that
format well actually do it. Each one is distilled from published transcripts of well-loved
talks, long-form interviews and late-night shows: what they open on, how long a turn runs,
who carries the words, how often a laugh lands, how they end. The sources, the numbers and
the method are in docs/research/script-references.md, and tools/script_references.py
re-measures them.

Playbooks hold patterns and measurements in our own words, never a transcript's words,
and name no show or person: a pod learns the craft, it doesn't imitate anyone.

`plan` goes to the planner (the shape of the episode and its opening); `write` goes to the
writers (the line-by-line craft). A pod gets its format's playbook while it keeps that
format's style; a custom style, an edited one or a mid-show restyle gets none.
"""
from __future__ import annotations

from .catalog import TEMPLATES_BY_ID

PLAYBOOKS: dict[str, dict[str, str]] = {
    # One speaker, one idea, a room. From seven of the most-watched stage talks and seven
    # widely shared speeches.
    "talk": {
        "plan": """\
- The talk has ONE idea, sayable in a single plain sentence. Give it a handle the speaker \
can keep coming back to: a coined name, an object or a character. Put the sentence and the \
handle in beat 1's notes. The best-loved talks say theirs five times or more.
- Beats, in order: a story or a question that makes the room feel the problem; the idea, \
stated; why it is true, as ONE piece of evidence told like a story (who looked, for how \
long, the one number that matters); the objection a sceptic in the room would raise, \
answered straight; what changes for the listener; the close.
- `cold_open` is the first lines of the talk itself, and here it replaces the welcome \
described above. Start inside a story ("A few years ago...") or on a question put to the \
room. No "welcome to the show", no agenda, no list of what's coming. If the speaker says \
their name at all, it is in passing, after the hook. If the talk is funny, the first laugh \
lands within the first three lines.
- The last beat's notes name the opening image, so the close can return to it.""",
        "write": """\
- Rhythm: build with a longer sentence, then land on a short one. Most sentences run 10 to \
15 words; about one in four is six words or fewer; no more than one in ten passes 30.
- About one sentence in ten is a question put to the room, which the speaker then answers.
- "I" tells the stories, "we" names the problem, "you" carries the ask.
- Humour comes out of the story: an honest admission, self-mockery, the absurd detail. A \
funny talk gets a laugh once or twice a minute; a grave one never forces it. Put the \
surprising word last in its sentence.
- Evidence is a scene (who ran it, how long, what they found), never a run of statistics.
- Each time a section closes, say the idea's handle again.
- The close: go back to the opening image, say the idea once more in one balanced sentence \
("not because..., but because..."), and stop there. Thanks are two words, said once, as \
the very last thing. Never sum up after the last line and never sign off like a radio host \
("I'm ..., have a great night").""",
    },
    # A host and an expert (or a guest) in a long-form conversation. From seven long-form
    # interview episodes across two shows.
    "interview": {
        "plan": """\
- Beat 1: the curious host frames the problem the way a listener meets it in their own \
life, then brings in the expert and says in one breath what the conversation will cover. \
The first question is about origin: why this, why now, how did you get into it.
- The middle has one beat that steps back ("let's zoom out") and one that walks a concrete \
scenario from start to finish ("say I've just sat down to start. Now what?").
- The last beat: one practical question, a short answer, thanks to the expert by name, and \
the host closes alone with the takeaway in a sentence or two.""",
        "write": """\
- The expert carries about two thirds of the words. An answer is developed, not a sound \
bite: the claim, how it works, then one example. That usually takes three to five lines \
in a row from the expert, and it can run on into the next segment. The 40-word limit is \
per line, not per answer. Do not hand back to the host after every line, and do not end an \
answer just because a segment ends.
- The host's turns come in three sizes. Small, about one in five: a reaction of twelve \
words or fewer ("Okay, so don't lead with that."), often as a pipe reaction inside the \
expert's line. Medium: one sentence that says back what the expert just said in plainer \
words, then the next question. Large, now and then: the host brings something of their \
own (something they noticed, tried or read) and offers it for the expert to react to.
- Only about a third of the host's turns end in a question. The rest hand over with a \
statement the expert picks up.
- The host starts turns the way people do: "So", "Yeah", "Right", "Okay, let's say...". \
Never "Great question" and never "Wait" twice in a row.
- Move the conversation with scenarios and stakes, not with "tell me more".
- The expert says where something comes from, and says plainly what isn't known yet.""",
    },
    # A late-night desk: a host, someone on the couch, bits. From seven late-night clips
    # (interviews and games), three opening monologues, four long desk pieces from a
    # news-comedy show, and one comic's commencement address.
    "talkshow": {
        "plan": """\
- Beat 1 is the monologue: four to six jokes about tonight's topic, each one built on a \
true fact from the SOURCE. Then the desk.
- Give every later beat a named segment with a job: the story of the night told properly; \
an "explain it to me" stretch that starts with the plainest question there is ("first off, \
what is it?"); a game with rules. Put the game's name and its rules in that beat's notes.
- The story of the night is built as evidence, then reaction, several times over: a fact \
or a line quoted from the SOURCE, what is absurd about it, then the serious point it \
proves. Note the three or four pieces of evidence in that beat.
- Plant one running gag in beat 1, something ridiculous and specific the host invents (a \
mascot, a nickname, an object on the desk), and note where it comes back. The best desk \
pieces bring it back bigger at the very end.
- The last beat is a goodnight with a callback: thirty seconds, not a recap.""",
        "write": """\
- A monologue joke: the setup is a true fact in one or two sentences, the punchline is one \
short sentence, and the surprise word comes last. Use the list with a turn (two straight \
items, the third is the joke) and the fake-solemn build that ends somewhere silly. About \
two laugh lines a minute.
- A setup is only as good as it is true. If the SOURCE has no fact for one, build the joke \
on something everybody has done or seen. Never make up a statistic, a study or a quote to \
set up a joke.
- More joke shapes that carry a desk piece: the absurdly specific comparison ("that has the \
energy of a man selling time-shares through a head mic"); the question the host answers in \
one word ("Who saw this coming? Everyone."); taking a quoted line literally; acting out \
someone in a voice for a sentence or two.
- After a joke, turn back to the point, about once a minute, with a plain sentence that \
starts "But", "And look", "Now" or "Because". The jokes sit on the argument; they are \
never the argument.
- At the desk the host can hold the floor: runs of 120 words and more between \
interruptions are normal there. The sidekick comes in at the turns, not after every line.
- The sidekick's reactions are tiny: one to five words that echo or top the host's last \
phrase ("Really?", "That's wild.", "He deserves it."). About a third of the sidekick's \
lines are that short, and some are pipe reactions inside the host's line. The rest of the \
time the sidekick asks what the audience is thinking or tells a quick story of their own.
- The host pulls stories out rather than telling them all: "take me back to the \
beginning", then lets the other one act it out with the dialogue in it ("and he goes, \
'read it again'").
- After an explanation, the host says it back in everyday words before moving on.
- A game: the host names it, gives the rules in three short sentences, then the rounds are \
fast. One line asks, one line answers, and the verdict is five words or fewer.
- The host throws to each segment out loud, and comes back from it with one line.
- Goodnight: the callback, one goodnight from each of them, and stop.""",
    },
    # One host alone at the mic, talking to one listener. From two solo episodes of personal
    # podcasts, the solo openings and closings of the interview shows, and the reflective
    # speeches.
    "solo": {
        "plan": """\
- `cold_open` starts on the listener, not the host: name the feeling or the situation they \
are in right now, and say why the host knows it is common (they keep noticing it in \
themselves and in the people around them; never invent listener mail or a survey). Then the host's name in passing, what the listener \
will be able to do or feel by the end, and a roadmap with a number in it ("three things, \
and the second one surprised me").
- Give each beat ONE point and ONE picture for it, an everyday image the host can come \
back to when the point lands (time as an ice cube melting on the counter). Put the \
picture in the beat's notes.
- A beat follows its thought to the end: what the host used to believe, what changed \
their mind (a moment with a time and a place, or what the SOURCE says), what they do now.
- The last beat is one takeaway, one question for the listener and one thing to do with \
it today. No recap of every beat.""",
        "write": """\
- Talk to one person, constantly. "You" or "your" comes up in nearly every sentence, six to \
eight times in a hundred words; "I" about half as often; "we" almost never.
- Rhythm: short. Most sentences run 9 to 13 words, a quarter to a third are six words or \
fewer, and very few pass 30.
- Say things in runs: two or three sentences in a row that start the same way ("You don't \
have to earn rest. You don't have to earn peace."). About one sentence in ten continues a \
run like that.
- Make the abstract concrete with a list of small everyday things ("you're answering \
texts, paying bills, working out what's for dinner"), then land the point in one short \
sentence.
- Say the listener's inner voice out loud, in their words ("why even bother?"), then \
answer it. Head off the reaction they are about to have ("I'm not saying this to scare \
you. I'm saying it because...").
- Think out loud: about one sentence in ten is a question, asked and then answered.
- Signpost with the number as each point opens ("number two"), and close the point by \
going back to its picture.
- Stories are the host's own and have a when and a where. One or two an episode, each \
tied straight back to the point.
- Say what you're unsure of, and where a fact comes from.
- The close: the takeaway, the question, the one thing to do today, a warm line said \
straight to the listener, one short goodbye, and stop.""",
    },
}

# Which playbook a starter template follows. Templates not listed have none yet: there is
# no reference material behind them.
FORMAT_OF = {
    "stage-talk": "talk",
    "inspirational": "talk",
    "idea-breakdown": "interview",
    "talk-show": "talkshow",
    "solo-pod": "solo",
}

# Seconds of audio a writer call covers, for formats whose turns run long. The default
# (settings.segment_seconds, 20 s) is two lines for a pair of hosts, which forces a ping-pong:
# at 20 s the expert's typical turn was 32 words, at 40 s it was 71 (the references: 129 and
# up). The cost is that a call-in or a restyle can wait one longer segment.
SEGMENT_SECONDS = {"interview": 40.0}

_BY_STYLE = {TEMPLATES_BY_ID[t]["style"].strip(): PLAYBOOKS[p] for t, p in FORMAT_OF.items()}
_SECONDS_BY_STYLE = {TEMPLATES_BY_ID[t]["style"].strip(): SEGMENT_SECONDS[p]
                     for t, p in FORMAT_OF.items() if p in SEGMENT_SECONDS}


def segment_seconds(style: str) -> float:
    """How long a segment this style's format wants, or 0 for the default."""
    return _SECONDS_BY_STYLE.get((style or "").strip(), 0.0)


def playbook(style: str) -> dict[str, str] | None:
    """The playbook for a style, if it is one of the starter templates' styles word for word."""
    return _BY_STYLE.get((style or "").strip())


def plan_block(style: str) -> str:
    """The planner's FORMAT PLAYBOOK block, or nothing."""
    book = playbook(style)
    if not book:
        return ""
    return ("\nFORMAT PLAYBOOK. How the best episodes of this format are built, drawn from studying real "
            "ones. Follow it; where it differs from the rules above, it wins. It never outranks accuracy.\n"
            f"{book['plan']}\n")


def write_block(style: str) -> str:
    """The writers' FORMAT PLAYBOOK block, or nothing."""
    book = playbook(style)
    if not book:
        return ""
    return ("\nFORMAT PLAYBOOK. How the best episodes of this format sound, drawn from studying real ones. "
            "Follow it; where it differs from \"How to write lines\" above, it wins. It never outranks "
            "accuracy or the language.\n"
            f"{book['write']}\n")
