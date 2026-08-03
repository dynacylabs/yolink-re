# Reverse Engineering YoLink

*Draft in progress. Written in order, section by section, against the outline in [outline.md](outline.md).*

---

## How to Read This Document

This is long, on purpose. It covers a multi-year, on-and-off reverse engineering effort, and I didn't want to write it in a way that only makes sense to people who already do embedded RE for a living. At the same time, I don't want to bore the people who do.

So: wherever I introduce a concept that a lay reader might not know, I'll drop it into a clearly marked primer box, like this one:

> 🔍 **Primer: How these boxes work**
> Primer boxes explain background concepts in plain language - no jokes, no narrative, just the concept. If you already know what's in the box, skip it; I'll tell you exactly where to pick back up.
>
> **Skip to:** the next `##` heading.

If you're comfortable with LoRa, MQTT, Ghidra, embedded flash dumping, and so on, just skip every box you see and read the plain narrative. If you're not, read the boxes - they're there so the story still makes sense without prior background.

---

## 1. Introduction / Motivation

This whole thing started because I wanted to turn some lights on and off.

Specifically: [solar parking lot lights](https://www.amazon.com/gp/product/B0CQM577YH/ref=sw_img_1?smid=A335HFQ4KI1MBR&th=1) - the split-type kind, panel and battery separate from the actual light head, IP66-rated, absurdly-inflated-wattage-claim included at no extra charge. Three of them, bought as a lot at auction - not new, but in acceptable shape - that I wanted installed around my pond so we could fish it at night. Out of the box they already have a dusk-to-dawn mode built in, plus a cheap IR remote for manual override, and nothing else: no app, no schedule, no integration with anything, just point the remote at the fixture and press a button, same as any other IR gadget from the last thirty years. I wanted them in Home Assistant instead. Turn on at dusk (which they already do on their own, to be fair), off at a set time regardless of what the built-in sensor thinks, maybe tie them to a motion sensor down the road. Small, normal, extremely boring ask.

The problem is where I live. My property is long and narrow - more of a corridor than a yard - and the pond sits out past the part of it any of my networking gear reaches. We're talking 300-400 feet from the house, not the couple hundred I originally remembered when I first wrote this down. That shape matters more than it sounds like it should, because it kills most of the easy answers before you even get to compare them:

- **A WiFi-based IR blaster** sounds great until you remember WiFi range from a single access point craters well before 300-400 feet. You either run cable (expensive, and now I'm trenching or stringing wire across the whole property for three light fixtures) or you add more APs out there (more expense, more things to maintain, still for three light fixtures).
- **A BLE-based IR blaster** has the same problem, worse - BLE's practical range is shorter than WiFi's, so it doesn't even get partial credit here.
- **A DIY 433MHz solution** solves the range problem reasonably well, but now I'm building and weatherproofing my own outdoor RF hardware from scratch, and I did not trust my own enclosure-sealing skills enough to bet a winter of pond-side weather on it.

What I actually needed was something with real range, that ran on batteries so I wasn't running power out there either, and that I could eventually get talking to Home Assistant *locally* - no cloud round-trip just to flip a light switch a football field away from my router.

Enter YoLink. On paper, it checked every box: a quarter-mile of LoRa range (which, shaped property or not, is enormous overkill for 300-400 feet, in the best way), battery-powered sensors with genuinely long battery life, and - the thing that actually got my attention - they sell an [IR remote/blaster](https://www.amazon.com/gp/product/B0824FF9Y5/ref=sw_img_1?smid=A2E6L4XU587CP3&psc=1) as one of their sensor types, specifically built to learn and replay 38kHz IR codes like the ones my parking lot lights' remotes used. Bonus: their catalog also includes vibration sensors and motion sensors, which meant if this worked, I wasn't just solving "control some lights," I was picking up a general-purpose long-range sensor platform for the whole property.

There was exactly one catch, and it was a big one: everything runs through YoLink's cloud. Their Home Assistant integration exists, but it talks to YoLink's servers, not to your hub directly. There's no official "just do this locally" option. Which meant the actual question I was signing up to answer wasn't "can I control some flood lights" - it was "can I get this hub talking to my network *without* YoLink's cloud in the loop."

I did not appreciate, when I started poking at this, how long an answer to that question was going to take. This ended up being a project I picked up and put down over years, not weeks - there were entire stretches where the hub sat on a shelf while life happened around it. (For a sense of scale: somewhere in the middle of this, I had a son. That's roughly how "on and off" we're talking.)

I'm getting ahead of the story, though. Before any of the reverse engineering, there was a lot of just... reading.

> 🔍 **Primer: LoRa vs. WiFi/BLE/Zigbee**
> These are all radio protocols used in home/IoT devices, but they trade off range, battery life, and bandwidth very differently:
> - **WiFi** - fast, power-hungry, short range (tens of meters indoors, more outdoors but still limited). Great for streaming video, bad for a battery-powered sensor you want to last years on a coin cell.
> - **Bluetooth Low Energy (BLE)** - low power, but short range (similar ballpark to WiFi, often less).
> - **Zigbee** - low power, mesh-capable, but still fundamentally short-range per hop (tens of meters).
> - **LoRa** ("Long Range") - the opposite tradeoff: very low bandwidth (think bytes to low-kilobytes per message, not streaming), but range measured in *miles* under good conditions, and very low power draw, which is why LoRa sensors can run for years on small batteries. It's built for "send a tiny message a long way, rarely," which is exactly the shape of most home sensor data (a door opened, a temperature reading, a button press) - just not the shape of moving a lot of data quickly.
>
> **Skip to:** [Section 2](#2-research-before-you-buy-osint-patents-and-fcc-filings)

---

## 2. Research Before You Buy: OSINT, Patents, and FCC Filings

Before I bought a single "sacrificial" YoLink device to crack open, I spent a lot of time not buying anything at all - just reading.

This matters more than it sounds like it should, because teardown-driven reverse engineering has an unavoidable cost structure: every device you open is a device you might have to buy a second one of, because the first one didn't survive the process, or because you needed a stock/unmodified unit to compare against once you'd already desoldered something off the first. Multiply that across hubs, multiple sensor types, and multiple board revisions of each, and "just buy one and see" stops being a reasonable default. So before spending money, I wanted a rough mental model of what was actually inside a given device - what chips, what radio, roughly what the board looked like - so I could prioritize what to buy first and skip devices that were obviously just re-badged versions of something I already had.

Two sources did almost all of the work here:

**FCC filings.** Every device that intentionally radiates RF and gets sold in the US has to go through FCC certification, and the filings for that certification are public. YoSmart's filings live under FCC ID grantee code `2ATM7` (browsable at [fccid.io/2ATM7](https://fccid.io/2ATM7)), and depending on the device and how much of the filing YoSmart asked to keep confidential, you can often pull internal teardown photos, block diagrams, and test setup descriptions straight from the filing - before you've spent a dollar on the actual hardware. That's how several of the `fcc_internal_photos.pdf` files that ended up in this repo's `hubs/` and `sensors/` directories were sourced - photos the FCC required YoSmart to submit, showing the boards from angles I hadn't opened a device far enough to see yet.

**Patents.** Patents are a messier source - deliberately vague in places, written by lawyers rather than engineers, and not always attached to the specific product revision you're looking at - but for a company like YoSmart with a fairly narrow product line, searching around their name and the LoRa-hub-and-sensor concept turned up filings that gave useful architectural hints: what the general hub-to-sensor relationship looked like from their own description of it, before I'd verified any of that against real hardware.

Between the two, I went into most purchases already having a rough idea of "this is probably an ESP32 with a LoRa radio riding alongside it" or "this board revision looks like a straightforward shrink of that one," which meant I could spend my actual hardware budget on devices likely to teach me something new, instead of buying blind and finding out after the fact that I'd just bought the same board in a different enclosure.

---

*(End of Section 2 draft. Next up: Section 3 - Hardware Survey.)*
