# Disk images

Every image format is decoded into the same thing - tracks holding sectors, each sector carrying the
address field the disk controller would find on it - so the FDC never deals with file layouts. A
sector is located by matching that address field against the sector and track registers, the way the
WD1772 does, rather than by computing an offset into the image.

| Format | What it is | EstyJS |
| --- | --- | --- |
| `.st` | Raw dump of all sectors, no header. Written for PaCifiST and now the common exchange format. | **yes** |
| `.msa` | Magic Shadow Archiver: 10 byte header, then one block per track and side, run length encoded on `$E5`. | **yes** |
| `.stx` | Pasti. Track level, with the address field, FDC status and unstable bytes of every sector recorded, so protected originals can be preserved. | **yes**, see below |
| `.zip` | Archive holding one `.st`, `.msa` or `.stx` image. | **yes** |
| `.sts` | Steem memory snapshot. Not a disk image, but loaded through the same button. | **load only** |
| `.dim` | FastCopy Pro: 32 byte header, then sectors. Some images hold only the sectors the FAT marks as used. | no, but could be |
| `.stt` | Steem track level format (`STEM` magic), sector and raw track data per track. | no |
| `.ipf`, `.ctr` | Software Preservation Society and KryoFlux. Track and flux level, read through the closed source CAPS library. | no |
| `.scp` | SuperCard Pro flux capture. | no |
| `.stw` | Steem's own writable track level format. | no |
| `.hfe` | HxC bitstream image, used by hardware floppy emulators such as the Gotek. | no |
| `.st.gz`, `.msa.gz` | Gzipped images. | no |
| `.img`, `.hdv` | ACSI or IDE hard disk images. EstyJS has no hard disk emulation at all. | no |

The geometry of an `.st` image is not stored anywhere in the file: it is worked out from the image
length together with the sector count in the boot sector, trying 9, 10 and 11 sectors per track.
Images with an unusual layout and no usable boot sector may therefore be misread. `.msa` and `.stx`
carry their geometry with them and do not have that problem.

### What .stx support covers

Read from the image and acted on:

- the address field of every sector, so unusual sector numbers work and a sector whose recorded track
  number disagrees with the track register answers record-not-found, as it would on the real machine;
- the recorded FDC status of each sector: CRC errors, deleted data marks, and sectors that have an
  address field but no data;
- fuzzy bytes, which read differently on every revolution, from the mask the image stores;
- whole track reads, answered from the track image, which is what several protected originals check;
- read address, which is how a program discovers what a track really holds.

Not emulated, all of it to do with time:

- the disk does not rotate. There is no index pulse, and a sector is found immediately instead of
  when it comes round;
- the read time recorded for each sector is ignored, as are the timing records that describe bit rate
  variation inside a sector (Macrodos and Speedlock protections);
- a track read always starts at the index, rather than wherever the head happens to be.

Protections that measure how long something takes, or where on the track the head is, therefore
still fail. Writing to an `.stx` image and formatting are not supported.
