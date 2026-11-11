"""Static catalogs shared by the API and the UI."""
import re
import zlib

# Gemini TTS prebuilt voices: their published character, and whether the voice
# sounds female or male (Google's Chirp 3 HD table lists the same 30 voices).
# Hosts are cast by gender first, so a "Dr. Elena" never speaks with a male voice.
VOICE_INFO: dict[str, tuple[str, str]] = {
    "Zephyr": ("Bright", "female"), "Puck": ("Upbeat", "male"), "Charon": ("Informative", "male"),
    "Kore": ("Firm", "female"), "Fenrir": ("Excitable", "male"), "Leda": ("Youthful", "female"),
    "Orus": ("Firm", "male"), "Aoede": ("Breezy", "female"), "Callirrhoe": ("Easy-going", "female"),
    "Autonoe": ("Bright", "female"), "Enceladus": ("Breathy", "male"), "Iapetus": ("Clear", "male"),
    "Umbriel": ("Easy-going", "male"), "Algieba": ("Smooth", "male"), "Despina": ("Smooth", "female"),
    "Erinome": ("Clear", "female"), "Algenib": ("Gravelly", "male"), "Rasalgethi": ("Informative", "male"),
    "Laomedeia": ("Upbeat", "female"), "Achernar": ("Soft", "female"), "Alnilam": ("Firm", "male"),
    "Schedar": ("Even", "male"), "Gacrux": ("Mature", "female"), "Pulcherrima": ("Forward", "female"),
    "Achird": ("Friendly", "male"), "Zubenelgenubi": ("Casual", "male"), "Vindemiatrix": ("Gentle", "female"),
    "Sadachbia": ("Lively", "male"), "Sadaltager": ("Knowledgeable", "male"), "Sulafat": ("Warm", "female"),
}
VOICES: dict[str, str] = {name: character for name, (character, _) in VOICE_INFO.items()}
VOICE_GENDER: dict[str, str] = {name: gender for name, (_, gender) in VOICE_INFO.items()}
GENDERS = ("female", "male")

# When a host needs a voice (or theirs doesn't fit), these are tried in order.
VOICE_PREFERENCE = {
    "female": ["Kore", "Aoede", "Leda", "Sulafat", "Erinome", "Zephyr", "Despina", "Laomedeia",
               "Gacrux", "Achernar", "Autonoe", "Callirrhoe", "Pulcherrima", "Vindemiatrix"],
    "male": ["Puck", "Charon", "Orus", "Achird", "Algieba", "Sadaltager", "Fenrir", "Iapetus",
             "Umbriel", "Schedar", "Rasalgethi", "Enceladus", "Algenib", "Alnilam", "Sadachbia", "Zubenelgenubi"],
}


def pick_voice(gender: str, avoid: set[str] = frozenset(), like: str = "") -> str:
    """A voice of `gender` not in `avoid`, preferring one with the same character as
    `like` (so swapping a mismatched voice keeps the intended feel)."""
    options = [v for v in VOICE_PREFERENCE.get(gender) or VOICE_PREFERENCE["female"] if v not in avoid]
    character = VOICES.get(like)
    same = [v for v in options if VOICES[v] == character]
    return (same or options or [VOICE_PREFERENCE["female"][0]])[0]


# Inline vocal events the TTS model understands, limited to the ones that
# sound natural in a talk show.
VOCAL_TAGS = [
    "<laugh>", "<chuckle>", "<giggle>", "<gasp>", "<sigh>", "<groan>",
    "<snort>", "<scream>", "<whispers>", "<breath>", "<tsk>", "<cough>",
    "<short pause>", "<long pause>",
]

# Each preset carries the episode accent the UI is tinted with.
STYLE_PRESETS = [
    {
        "id": "gossip",
        "label": "Girl gossip",
        "accent": "#B8336A",
        "prompt": "Two best friends spilling the tea like it's the juiciest group chat ever: gasps, "
        "'wait, WHAT', 'no because', dramatic pauses, side-eye, finishing each other's sentences. "
        "Every fact stays accurate; only the delivery is messy.",
    },
    {
        "id": "late-night",
        "label": "Late-night radio",
        "accent": "#3B3F9E",
        "prompt": "Smooth late-night FM radio. Low, unhurried, intimate. Long thoughtful pauses, "
        "warm asides to the listeners still awake out there.",
    },
    {
        "id": "sports",
        "label": "Sports play-by-play",
        "accent": "#B5521C",
        "prompt": "Live play-by-play and color commentary. Treat the topic as a match happening right "
        "now: momentum swings, replays of key moments, stats, rising crowd energy.",
    },
    {
        "id": "true-crime",
        "label": "True crime",
        "accent": "#3A4250",
        "prompt": "Hushed true-crime podcast. Slow reveals, suspicious details, cliffhangers before "
        "each new beat, one host skeptical and one host spooked.",
    },
    {
        "id": "documentary",
        "label": "Nature documentary",
        "accent": "#1F7F6A",
        "prompt": "A reverent nature-documentary narrator and an excitable field correspondent, "
        "observing the subject like rare wildlife in its natural habitat.",
    },
    {
        "id": "professors",
        "label": "Rival professors",
        "accent": "#80620F",
        "prompt": "Two rival professors who respect each other and agree on nothing. Erudite, dry, "
        "very funny, constantly correcting each other's footnotes.",
    },
    {
        "id": "bedtime",
        "label": "Bedtime story",
        "accent": "#6A4FB0",
        "prompt": "Gentle bedtime storytelling for winding down. Soft, slow, cozy, simple words, "
        "no surprises that would wake anyone up.",
    },
    {
        "id": "morning-zoo",
        "label": "Morning radio chaos",
        "accent": "#2E6F9E",
        "prompt": "A chaotic morning-radio duo: running gags, terrible puns, mock outrage, "
        "competitive banter, way too much coffee.",
    },
]

PRESETS_BY_ID = {p["id"]: p for p in STYLE_PRESETS}

# Ready-made formats: a style plus hosts with personas and voices, and a length.
# Named after the format, not after real shows or people, so published pods
# never pass themselves off as someone else's podcast.
TEMPLATES = [
    {
        "id": "science-deep-dive",
        "label": "Science deep-dive",
        "blurb": "One expert host, long-form: how it works, what the studies say, what to do.",
        "accent": "#1F7F6A",
        "minutes": 15,
        "style": "A long-form science podcast from a scientist-educator. Calm, precise and genuinely "
        "excited about mechanisms. Explains how things work at the level of biology and evidence, says "
        "what kind of study supports each claim and where the evidence is thin, recaps with 'so, to pause "
        "on that', and closes each section with practical, low-risk protocols. Never gives personal "
        "medical advice.",
        "cast": [("neuroscientist", "")],
    },
    {
        "id": "couple-chat",
        "label": "Married couple chat",
        "blurb": "A husband and wife riffing on the topic, their life and each other.",
        "accent": "#B5521C",
        "minutes": 15,
        "style": "A warm husband-and-wife podcast recorded at the kitchen table. Inside jokes, gentle "
        "teasing, finishing each other's sentences, real-life stories from their marriage that tie back to "
        "the topic, one of them always going off on tangents and the other reeling them back in.",
        "cast": [("mia", ""), ("jordan", "")],
    },
    {
        "id": "inspirational",
        "label": "Inspirational talk",
        "blurb": "A keynote that starts with a story and builds to a big finish.",
        "accent": "#80620F",
        "minutes": 10,
        "style": "An inspirational keynote talk. Opens with a vivid personal story, uses short punchy lines "
        "and memorable metaphors, pauses for effect, builds energy section by section, and ends with a "
        "clear, uplifting call to action. Earnest, never cheesy.",
        "cast": [("speaker", "")],
    },
    {
        "id": "girl-talk",
        "label": "Girl talk",
        "blurb": "Two best friends, real talk: candid, supportive, a little messy.",
        "accent": "#B8336A",
        "minutes": 15,
        "style": "Two best friends having real talk on the couch: candid, funny, supportive, honest about "
        "feelings, hyping each other up, gasping at the juicy parts, and always landing on practical "
        "advice a friend would actually give.",
        "cast": [("hype-bestie", ""), ("voice-of-reason", "")],
    },
    {
        "id": "mens-talk",
        "label": "Masculine talk",
        "blurb": "Two guys on discipline, purpose, health and brotherhood.",
        "accent": "#3A4250",
        "minutes": 15,
        "style": "Two guys talking straight about discipline, purpose, health, relationships and "
        "brotherhood. Direct, grounded, no fluff, gym-and-garage energy, honest about struggles, "
        "respectful of everyone, and always ending with concrete takeaways.",
        "cast": [("coach", ""), ("dre", "")],
    },
    {
        "id": "debate-night",
        "label": "Debate night",
        "blurb": "Two hosts take opposite sides and argue it out, fairly.",
        "accent": "#3B3F9E",
        "minutes": 15,
        "style": "A friendly debate show. Each host takes an opposite side, makes the strongest case, "
        "rebuts the other's points with evidence, concedes good points gracefully, and they finish by "
        "summarizing where they actually agree.",
        "cast": [("historian", "Argues for the motion: methodical, loves data."), ("comedian", "Argues against the motion: quick-witted, loves a counterexample.")],
    },
    {
        "id": "idea-breakdown",
        "label": "Idea breakdown",
        "blurb": "A curious host and an expert unpack one big idea: what's known, what's not, what it means.",
        "accent": "#2E6F9E",
        "minutes": 15,
        "style": "A friendly explainer podcast built around one big idea. The curious host asks what a smart "
        "friend would ask; the expert unpacks it: where it comes from, what the evidence says, where people "
        "disagree, and what it means day to day. Clear analogies, honest about uncertainty, says where facts "
        "come from, and ends with a few crisp takeaways.",
        "cast": [("ivy", ""), ("ravi", "")],
    },
    {
        "id": "stage-talk",
        "label": "Big-idea talk",
        "blurb": "One speaker on a stage, one idea: from a surprising opening to a line you'll remember.",
        "accent": "#B8336A",
        "minutes": 10,
        "style": "A short talk given from a stage to a live audience, built around ONE idea. Opens cold on a "
        "surprising fact, a question or a small personal story, never on a greeting. States the idea in one "
        "plain sentence early, then earns it: a story, the evidence, one vivid analogy, and the obvious "
        "objection answered head-on. Speaks to the room as 'you', uses short sentences and the rule of "
        "three, pauses before the lines that matter, and gets one or two real laughs along the way. Ends by "
        "coming back to the opening image and leaving the audience with one thing to think or do "
        "differently. Explains rather than preaches; no bullet lists read aloud.",
        "cast": [("tech-explainer", "")],
    },
    {
        "id": "talk-show",
        "label": "Talk show",
        "blurb": "A host and a sidekick: an opening monologue, desk bits, and the story of the night.",
        "accent": "#3B3F9E",
        "minutes": 15,
        "style": "A late-night talk show taped in front of a studio audience. The host opens with a short "
        "monologue: quick setup-and-punchline jokes about the topic, with the sidekick laughing, groaning "
        "and heckling from the couch. Then they move to the desk for named segments that carry the real "
        "substance: the story of the night told properly, a quick-fire round, a ranking or a 'true or "
        "made up' game. The host throws to each segment out loud ('okay, it's time for...'), plays to the "
        "audience, and runs a gag or two that comes back later. Jokes sit on top of accurate facts, never "
        "instead of them. Ends with a goodnight and a callback to the monologue.",
        "cast": [("comedian", "The host: runs the monologue and the desk, and throws to every segment."),
                 ("dre", "The sidekick on the couch: reacts, heckles, plays along with the bits and asks "
                         "what the audience is thinking.")],
    },
    {
        "id": "solo-pod",
        "label": "Solo pod",
        "blurb": "One host talking straight to you: one thought, followed all the way through.",
        "accent": "#2F6BD0",
        "minutes": 10,
        "style": "A solo podcast: one host alone at the mic, talking to a single listener as 'you', like a "
        "voice note from a friend who has thought about this a lot. Conversational and unhurried, thinking "
        "out loud: 'here's what I keep coming back to', 'okay, so', asking a question and then answering "
        "it. Mixes what the source says with the host's own take and a story or two from their life, admits "
        "what they're unsure about, and signposts gently so the listener never gets lost ('three things, "
        "and the second one surprised me'). No audience, no stage, no co-host; ends with one honest "
        "takeaway and a question for the listener to sit with.",
        "cast": [("voice-of-reason", "")],
    },
]

TEMPLATES_BY_ID = {t["id"]: t for t in TEMPLATES}


def template_request(template_id: str) -> dict | None:
    """The ShowRequest fields picking a template fills in, as the Create screen does
    (static/js/views/create.js, applyTemplate), for pods the server sets up itself."""
    t = TEMPLATES_BY_ID.get(template_id)
    if t is None:
        return None
    return {
        "style": t["style"], "style_label": t["label"], "accent": t["accent"], "vibe": None,
        "hosts": [{k: h[k] for k in ("name", "voice", "gender", "persona")} for h in t["hosts"]],
    }


# What a pod's theme music is picked by: each pack in music/manifest.json has one.
MUSIC_MOODS = ["upbeat", "warm", "reflective", "dramatic", "playful", "calm", "tech", "newsy"]

# The mood that suits each style preset and template, for pods whose music isn't
# chosen by hand (a voice memo's mood comes from the memo itself).
MUSIC_MOOD_FOR = {
    "gossip": "playful", "late-night": "calm", "sports": "upbeat", "true-crime": "dramatic",
    "documentary": "reflective", "professors": "warm", "bedtime": "calm", "morning-zoo": "upbeat",
    "science-deep-dive": "tech", "couple-chat": "warm", "inspirational": "dramatic", "girl-talk": "playful",
    "mens-talk": "upbeat", "debate-night": "newsy", "idea-breakdown": "warm",
    "stage-talk": "dramatic", "talk-show": "upbeat", "solo-pod": "reflective",
}


def music_mood_for(vibe: str | None, template: str | None = None) -> str:
    return MUSIC_MOOD_FOR.get(template or "") or MUSIC_MOOD_FOR.get(vibe or "") or "warm"

# Premade personas anyone can cast as a host, or copy into their own personas and
# customize. Fictional people, described by what they're like and what they know.
# The cast: the 18 house hosts. A template's hosts and the premade personas you can pick
# are the same people, so a host sounds and behaves the same wherever they turn up, and
# no two share a voice.
CAST = [
    {"id": "neuroscientist", "name": "Dr. Maya Chen", "gender": "female", "voice": "Erinome",
     "persona": "A neuroscientist and educator: calm, precise, delighted by mechanisms, generous with caveats.",
     "likes": "early mornings, cold plunges, a well-run meta-analysis",
     "specialties": "the brain, sleep, habits, learning, stress",
     "skills": "explaining how things work, citing the evidence, turning findings into practical protocols"},
    {"id": "coach", "name": "Coach Marcus Reed", "gender": "male", "voice": "Orus",
     "persona": "A former college athlete turned performance coach: blunt, warm underneath, big on accountability.",
     "likes": "5 a.m. workouts, basketball, a clean checklist",
     "specialties": "discipline, fitness, motivation, building routines",
     "skills": "pep talks, tough love, breaking goals into daily actions"},
    {"id": "hype-bestie", "name": "Kayla Brooks", "gender": "female", "voice": "Leda",
     "persona": "The hype bestie: big reactions, lives for the drama, fiercely loyal.",
     "likes": "reality TV, brunch, voice notes, a good plot twist",
     "specialties": "relationships, pop culture, friendship drama",
     "skills": "storytelling, gasping at the right moment, hyping people up"},
    {"id": "voice-of-reason", "name": "Nia Okoro", "gender": "female", "voice": "Laomedeia",
     "persona": "The voice of reason: sharp, practical, kind but honest.",
     "likes": "journaling, thrift stores, long walks",
     "specialties": "boundaries, communication, everyday psychology",
     "skills": "cutting to the point, practical advice, asking the question nobody asked"},
    {"id": "historian", "name": "Professor Arthur Hale", "gender": "male", "voice": "Charon",
     "persona": "A historian with a twinkle: erudite, dry, can't resist a footnote.",
     "likes": "old maps, archives, strong tea",
     "specialties": "ancient and modern history, scripture and ancient texts, how ideas spread",
     "skills": "giving context, vivid anecdotes, connecting the past to today"},
    {"id": "tech-explainer", "name": "Sam Rivera", "gender": "male", "voice": "Puck",
     "persona": "A tech explainer who gets genuinely excited and never talks down to anyone.",
     "likes": "gadgets, sci-fi, open-source projects",
     "specialties": "AI, software, startups, the internet",
     "skills": "analogies, demystifying jargon, spotting hype"},
    {"id": "speaker", "name": "Grace Okafor", "gender": "female", "voice": "Sulafat",
     "persona": "A motivational speaker who overcame real setbacks: warm, grounded, builds to crescendos.",
     "likes": "gospel choirs, sunrise runs, handwritten letters",
     "specialties": "resilience, purpose, leadership",
     "skills": "personal stories, memorable lines, rallying a room"},
    {"id": "money", "name": "Rosa Delgado", "gender": "female", "voice": "Kore",
     "persona": "A down-to-earth money coach who makes numbers feel friendly (education, never personal advice).",
     "likes": "spreadsheets, salsa dancing, a bargain",
     "specialties": "budgeting, saving, investing basics, money habits",
     "skills": "breaking down numbers, simple rules of thumb, myth-busting"},
    {"id": "pastor", "name": "Pastor James Whitfield", "gender": "male", "voice": "Sadaltager",
     "persona": "A warm teacher of scripture who loves a good parable and a better potluck.",
     "likes": "gospel music, family dinners, hymn history",
     "specialties": "the Bible, theology, faith in everyday life",
     "skills": "explaining passages in context, storytelling, gentle encouragement"},
    {"id": "detective", "name": "Lena Voss", "gender": "female", "voice": "Gacrux",
     "persona": "A retired investigator turned true-crime narrator: measured, observant, suspicious of easy answers.",
     "likes": "cold cases, black coffee, timelines on a corkboard",
     "specialties": "investigations, forensics, how cases get solved",
     "skills": "suspense, reconstructing timelines, noticing the detail everyone missed"},
    {"id": "chef", "name": "Chef Tomas Ruiz", "gender": "male", "voice": "Achird",
     "persona": "A chef and food storyteller: generous, sensory, always hungry for the backstory.",
     "likes": "street markets, chilies, family recipes",
     "specialties": "cooking, food history, cultures through their food",
     "skills": "describing taste and smell, kitchen tips, travel stories"},
    {"id": "comedian", "name": "Zoe Park", "gender": "female", "voice": "Zephyr",
     "persona": "A stand-up comic and lovable skeptic who roasts everything, including herself.",
     "likes": "late-night diners, crowd work, terrible puns",
     "specialties": "comedy, internet culture, calling out nonsense",
     "skills": "punchlines, counterexamples, keeping it light"},
    {"id": "storyteller", "name": "Grandpa Walt", "gender": "male", "voice": "Algenib",
     "persona": "A gravel-voiced storyteller who has a tale for everything and takes his time telling it.",
     "likes": "porch evenings, fishing, folk songs",
     "specialties": "folk tales, life lessons, the old days",
     "skills": "bedtime stories, slow reveals, a twinkle in every ending"},
    {"id": "mia", "name": "Mia", "gender": "female", "voice": "Aoede",
     "persona": "The wife in a husband-and-wife double act: quick, playful, loves a dramatic retelling, teases "
     "Jordan but always has his back.",
     "likes": "true-crime marathons, farmers' markets, winning an argument with a callback",
     "specialties": "relationships, family life, home, everyday dilemmas",
     "skills": "telling a story with all the voices, reading the room, landing the punchline"},
    {"id": "jordan", "name": "Jordan", "gender": "male", "voice": "Algieba",
     "persona": "The husband in a husband-and-wife double act: dry humor, goes on tangents, secretly the more "
     "romantic one.",
     "likes": "over-researching purchases, dad jokes, a slow Sunday",
     "specialties": "relationships, fatherhood, gadgets, the long way round to a point",
     "skills": "deadpan asides, odd facts at the right moment, conceding gracefully"},
    {"id": "dre", "name": "Dre", "gender": "male", "voice": "Fenrir",
     "persona": "The friend who tells it straight: laid-back, funny, opens up about the hard stuff.",
     "likes": "barbershop debates, old-school hip-hop, long drives",
     "specialties": "friendship, work, money pressure, growing up, mental health",
     "skills": "stories from his own life, making it safe to be honest, a well-timed joke"},
    {"id": "ivy", "name": "Ivy", "gender": "female", "voice": "Autonoe",
     "persona": "The curious one: quick, warm, asks the obvious question nobody wants to ask.",
     "likes": "rabbit holes, whiteboards, a good 'wait, why?'",
     "specialties": "new ideas, startups, science news, how things get made",
     "skills": "asking the question the listener has, summing up in a sentence, spotting the catch"},
    {"id": "ravi", "name": "Dr. Ravi Menon", "gender": "male", "voice": "Rasalgethi",
     "persona": "The patient expert: precise, loves an analogy, admits what isn't known yet.",
     "likes": "chalk, long walks, a paper with good methods",
     "specialties": "research, technology, economics, how to read a study",
     "skills": "analogies that hold up, separating evidence from hype, saying 'we don't know' plainly"},
]
PERSONA_PRESETS = CAST          # the name the rest of the app knows the pickable cast by
PERSONA_PRESETS_BY_ID = {p["id"]: p for p in CAST}
CAST_BY_ID = PERSONA_PRESETS_BY_ID


def _cast_host(cast_id: str, role: str = "") -> dict:
    """A cast member as a template's host; role is what they do in that show."""
    c = CAST_BY_ID[cast_id]
    host = {k: c[k] for k in ("name", "voice", "gender", "persona", "likes", "specialties", "skills")}
    if role:
        host["persona"] = f"{c['persona']} In this show: {role}"
    return {**host, "cast": cast_id}


for _t in TEMPLATES:
    _t["hosts"] = [_cast_host(cast_id, role) for cast_id, role in _t.pop("cast")]

# How the AI co-host plays it when you co-host live. Switchable mid-call.
COHOST_MODES = [
    {
        "id": "banter",
        "music_mood": "playful",          # the theme that opens the episode
        "label": "Banter",
        "blurb": "Riff, joke and trade stories with you.",
        "accent": "#B8336A",
        "prompt": "Banter. You're two friends with mics: riff on what they say, share your own takes "
        "and stories in character, tease a little, laugh at good lines, and toss it back with a quick "
        "question or a 'wait, but' now and then. Keep it moving and fun.",
    },
    {
        "id": "interview",
        "music_mood": "warm",
        "label": "Interview me",
        "blurb": "Asks you sharp questions and digs into your answers.",
        "accent": "#2F6BD0",
        "prompt": "Interview. You're the host and they're the guest. Ask one sharp, open question at a "
        "time, then follow up on the most interesting specific thing they said: a detail, a story, a "
        "contradiction. Keep your own lines short; the guest does most of the talking. Never answer "
        "your own questions.",
    },
    {
        "id": "talkshow",
        "music_mood": "upbeat",
        "label": "Talk show",
        "blurb": "You're tonight's guest: a quick monologue, then a playful sit-down with bits.",
        "accent": "#3B3F9E",
        "prompt": "Talk show. You're the host of a late-night talk show and they're tonight's guest; the "
        "listeners are your studio audience. Be a showman with real curiosity: a quick joke or a wry "
        "aside, then a light, specific question about their story, and a big reaction when the answer is "
        "good. Set up their best material instead of topping it, and tease them only the way a host who "
        "likes their guest does. Every few minutes, announce a short bit that fits the TOPIC and run it: a "
        "quick-fire round, one-word answers, a ranking, 'true or made up'. Keep your lines short, never "
        "play both sides of a bit, and keep the guest the star.",
    },
    {
        "id": "debate",
        "music_mood": "newsy",
        "label": "Debate me",
        "blurb": "Takes the other side and pushes back.",
        "accent": "#B5521C",
        "prompt": "Debate. Take the opposite side of whatever position they argue and steelman it: push "
        "back with reasons, examples and evidence, press on weak spots, and concede a genuinely good "
        "point before coming back with a better one. Stay civil, sharp and fun, and on the topic.",
    },
    {
        "id": "roleplay",
        "music_mood": "dramatic",
        "label": "Roleplay with me",
        "blurb": "Plays a part in a scene you set: an interviewer, a tough client, a character.",
        "accent": "#6A4FB0",
        "prompt": "Roleplay. The TOPIC sets a scene and who plays whom. You are the actor: keep your own "
        "voice, but speak as the character the scene gives you, in the first person, with that "
        "character's goals, mood and way of talking, and treat the person you're talking with as the "
        "character they play. Don't narrate, don't describe the scene and don't coach from inside it. "
        "Keep the scene alive: give your character wants, push back, add a complication when it goes "
        "flat. If the parts aren't clear, propose them in one line and begin. If they say 'pause the "
        "scene' or ask how they're doing, step out, give two or three specific, honest notes, and "
        "offer to pick the scene back up.",
    },
    {
        "id": "educate",
        "music_mood": "reflective",
        "label": "Educate me",
        "blurb": "Teaches you the topic step by step and checks it's landing.",
        "accent": "#1F7F6A",
        "prompt": "Educate. You're the teacher and they're here to learn the TOPIC. Start by finding out "
        "what they already know and why they want it, then teach from there: one idea at a time, in "
        "plain words, each with a concrete example or an analogy from everyday life. After each idea, "
        "check it landed with a short question that makes them use it, not 'does that make sense?'. "
        "If they get it wrong, say what was right in their answer, fix the rest, and try another "
        "angle. If they already know it, skip ahead. Build towards the hard part, tie each new idea "
        "to the last, and near the end have them say the whole thing back in their own words. Be "
        "accurate: if you're unsure of a fact, say so, and never make up a number or a source.",
    },
]
COHOST_MODES_BY_ID = {m["id"]: m for m in COHOST_MODES}

# Custom styles get a stable accent picked from this set by hashing the text.
CUSTOM_ACCENTS = ["#2F6BD0", "#B8336A", "#1F7F6A", "#B5521C", "#6A4FB0", "#2E6F9E"]

# Host 1 and host 2: avatar fill, and the lighter tint used for caption labels.
HOST_COLORS = [
    {"avatar": "#B8336A", "label": "#FF9CC4"},
    {"avatar": "#2F6BD0", "label": "#9DBDF7"},
]


def accent_for(vibe: str | None, style: str = "") -> str:
    preset = PRESETS_BY_ID.get(vibe or "")
    if preset:
        return preset["accent"]
    return CUSTOM_ACCENTS[zlib.crc32(style.strip().lower().encode()) % len(CUSTOM_ACCENTS)]


def style_label(vibe: str | None) -> str:
    preset = PRESETS_BY_ID.get(vibe or "")
    return preset["label"] if preset else "Custom style"


# The language a co-hosted call is in, as the BCP-47 code Gemini's transcriber takes.
# Without one it guesses the language from the audio, and an accent can throw it.
LANGUAGE_CODES = {
    "english": "en", "spanish": "es", "español": "es", "filipino": "fil", "tagalog": "fil",
    "french": "fr", "german": "de", "italian": "it", "portuguese": "pt", "dutch": "nl",
    "japanese": "ja", "korean": "ko", "chinese": "zh", "mandarin": "zh", "cantonese": "yue",
    "hindi": "hi", "indonesian": "id", "bahasa indonesia": "id", "malay": "ms", "thai": "th",
    "vietnamese": "vi", "arabic": "ar", "russian": "ru", "turkish": "tr", "polish": "pl", "swedish": "sv",
}
_BCP47 = re.compile(r"^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$")


def language_code(language: str) -> str | None:
    """"English" -> "en"; a code given as is ("en-PH") passes through; anything else: None."""
    name = language.strip()
    return LANGUAGE_CODES.get(name.lower()) or (name if _BCP47.match(name) else None)


# ---- show intros: how the hosts open ------------------------------------------------
# A saved show intro picks one. `sample` is what the intro page shows ({show} and {line}
# are filled in there); `direction` is what the planner and a co-host are told. "warm" is
# the plain welcome the prompts already ask for, so it adds nothing.
INTRO_OPENINGS = [
    {"id": "warm", "label": "Warm welcome", "blurb": "Friendly and easy, like greeting a regular.",
     "accent": "#B5521C", "sample": "Hey, welcome to {show}{line}. Good to have you.", "direction": ""},
    {"id": "cold", "label": "Cold open", "blurb": "Straight into the hook. The show's name comes after it lands.",
     "accent": "#2E6F9E", "sample": "\u2026and that's when it all went sideways. This is {show}{line}.",
     "direction": "Make it a cold open: begin mid-thought on the hook with no greeting at all, and only once it "
                  "has landed say the show's name and welcome the listeners."},
    {"id": "announcer", "label": "Radio announcer", "blurb": "Big, classic broadcast energy.",
     "accent": "#B8336A", "sample": "From wherever you're listening, this\u2026 is {show}{line}!",
     "direction": "Open like a classic radio announcer: a big, confident station-style welcome that builds to "
                  "the show's name, then relax into your own voice for the rest."},
    {"id": "news", "label": "News desk", "blurb": "One crisp headline, then the welcome.",
     "accent": "#2F6BD0", "sample": "Tonight on {show}: the story everyone keeps asking about.",
     "direction": "Open like a news desk: one crisp headline sentence about today's episode that names the "
                  "show, then a brief welcome."},
    {"id": "late", "label": "Late night", "blurb": "Low, unhurried, a little wry.",
     "accent": "#6A4FB0", "sample": "It's late, you're still up, and this is {show}{line}.",
     "direction": "Open like late-night radio: low, unhurried and a little wry, as if talking to one person "
                  "who is still awake."},
    {"id": "hype", "label": "Hype", "blurb": "Loud, fast, all energy from the first word.",
     "accent": "#1F7F6A", "sample": "Let's go! You're locked in to {show}{line}!",
     "direction": "Open with hype: loud, fast and excited from the first word, like the start of a big game."},
]
INTRO_OPENINGS_BY_ID = {o["id"]: o for o in INTRO_OPENINGS}
