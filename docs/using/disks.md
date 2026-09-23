# Disk images

Every format is decoded into the same structure: tracks holding sectors, each sector with the
address field the controller would find on it. A sector is located by matching that address field
against the sector and track registers, as the WD1772 does.

| Format | What it is | EstyJS |
| --- | --- | --- |
| `.st` | Raw dump of all sectors, no header. Written for PaCifiST, now the common exchange format. | yes |
| `.msa` | Magic Shadow Archiver: 10 byte header, one block per track and side, run length encoded on `$E5`. | yes |
| `.stx` | Pasti. Track level, with address field, FDC status and unstable bytes per sector. | yes, see below |
| `.zip` | Archive holding one `.st`, `.msa` or `.stx` image. | yes |
| `.sts` | Steem memory snapshot, not a disk image. Loaded through the same button. | load only |
| `.dim` | FastCopy Pro: 32 byte header, then sectors. Some images hold only the sectors the FAT marks as used. | no |
| `.stt` | Steem track level format (`STEM` magic). | no |
| `.ipf`, `.ctr` | Software Preservation Society and KryoFlux. Needs the closed source CAPS library. | no |
| `.scp` | SuperCard Pro flux capture. | no |
| `.stw` | Steem writable track level format. | no |
| `.hfe` | HxC bitstream image, for hardware floppy emulators. | no |
| `.st.gz`, `.msa.gz` | Gzipped images. | no |
| `.img`, `.hdv` | ACSI or IDE hard disk images. EstyJS has no hard disk emulation. | no |

`.st` images carry no geometry. It is derived from the image length and the sector count in the boot
sector, trying 9, 10 and 11 sectors per track. Images with an unusual layout and no usable boot
sector may be misread. `.msa` and `.stx` carry their geometry in the header.

## STX

Read from the image and acted on:

- The address field of every sector. Unusual sector numbers work, and a sector whose recorded track
  number disagrees with the track register answers record-not-found.
- Recorded FDC status per sector: CRC errors, deleted data marks, address field without data.
- Fuzzy bytes, from the mask in the image.
- Whole track reads, answered from the track image.
- Read address.

Not emulated:

- Disk rotation. No index pulse, and a sector is found immediately instead of when it comes round.
- The read time recorded per sector, and the timing records describing bit rate variation inside a
  sector (Macrodos, Speedlock).
- Track reads start at the index instead of at the head position.

Protections that measure time or head position therefore fail. Writing to an `.stx` image and
formatting are not supported.
