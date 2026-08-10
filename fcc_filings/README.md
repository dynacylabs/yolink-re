# FCC Filings

Public FCC certification filings for YoSmart devices (grantee code `2ATM7`, see https://fccid.io/2ATM7), downloaded with [tools/fccid_downloader](../tools/fccid_downloader). Each subdirectory here is one FCC ID, containing the filing's exhibits as delivered by fccid.io (Internal/External Photos, Users Manual, Test Report, Test Setup Photos, Cover Letters, etc.) plus a `chip_identification.md` written from those photos.

FCC-filing internal photos were also the main source used to figure out purchase priorities before buying hardware to tear down - see the project writeup's "Research Before You Buy" section.

## Filings gathered so far

| FCC ID | YoSmart's listed name | Repo device(s) |
|---|---|---|
| [2ATM71603M](2ATM71603M) | YoLink Hub | [hubs/P1603](../hubs/P1603) (both V1.0 and V2.4 - same filing) |
| [2ATM71604](2ATM71604) | Speaker Hub | [hubs/P1604](../hubs/P1604) |
| [2ATM71605](2ATM71605) | Hub 3 | [hubs/P1605](../hubs/P1605) and [hubs/P1606](../hubs/P1606) - **see the architecture conflict noted in the chip identification doc** |
| [2ATM77704](2ATM77704) | Door Sensor | [sensors/YS7704](../sensors/YS7704) and [sensors/P0706](../sensors/P0706) - same filing |
| [2ATM77804](2ATM77804) | Motion Sensor | none currently in this repo - board is `P7804`, not [P7805](../sensors/P7805) as originally guessed |
| [2ATM77805](2ATM77805) | Outdoor Motion Sensor | [sensors/YS7804](../sensors/YS7804) |
| [2ATM78003](2ATM78003) | Temperature Humidity Sensor | [sensors/YS8003](../sensors/YS8003) |

## Still open
- The real FCC ID for [P7805](../sensors/P7805) hasn't been found yet.
- No filing identified yet for [P0603](../chips/P0603) (may not need one independently - see its chip identification note) or the [YL09](../chips/YL09) chip itself.
- The full list of 60 FCC IDs under grantee `2ATM7` is much longer than what's been pulled here - only the devices already present in this repo were prioritized. Re-run `fccid_downloader` against any of the remaining IDs (see the FCC ID search link above) if a new device gets added.
