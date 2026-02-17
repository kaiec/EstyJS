/*
 * aym-playlist.js - Copyright (c) 2001-2025 - Olivier Poncet
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

import { Music as Antiriad      } from './musics/antiriad.js';
import { Music as AxelF         } from './musics/axel-f.js';
import { Music as BurninRubber  } from './musics/burnin-rubber.js';
import { Music as Cauldron1     } from './musics/cauldron1.js';
import { Music as Cauldron2     } from './musics/cauldron2.js';
import { Music as CommandoIntro } from './musics/commando-intro.js';
import { Music as CommandoTheme } from './musics/commando-theme.js';
import { Music as GhostNGoblins } from './musics/ghost-n-goblins.js';
import { Music as GryzorIntro   } from './musics/gryzor-intro.js';
import { Music as GryzorTheme   } from './musics/gryzor-theme.js';
import { Music as HeadOverHeels } from './musics/head-over-heels.js';
import { Music as RoboCop       } from './musics/robocop.js';
import { Music as Sorcery       } from './musics/sorcery.js';

// ---------------------------------------------------------------------------
// Playlist
// ---------------------------------------------------------------------------

const Playlist = [
    Antiriad,
    AxelF,
    BurninRubber,
    Cauldron1,
    Cauldron2,
    CommandoIntro,
    CommandoTheme,
    GhostNGoblins,
    GryzorIntro,
    GryzorTheme,
    HeadOverHeels,
    RoboCop,
    Sorcery,
];

// ---------------------------------------------------------------------------
// AYM_Playlist
// ---------------------------------------------------------------------------

export class AYM_Playlist {
    constructor(options) {
        this.cur_track = 0;
        this.min_track = 0;
        this.max_track = (Playlist.length - 1);
    }

    getMusic() {
        return Playlist[this.cur_track];
    }

    prevMusic() {
        const old_track = this.cur_track;
        this.cur_track = ((this.cur_track - 1) | 0);
        if(this.cur_track < this.min_track) {
            this.cur_track = this.min_track;
        }
        if(this.cur_track != old_track) {
            return this.getMusic();
        }
        return null;
    }

    nextMusic() {
        const old_track = this.cur_track;
        this.cur_track = ((this.cur_track + 1) | 0);
        if(this.cur_track > this.max_track) {
            this.cur_track = this.max_track;
        }
        if(this.cur_track != old_track) {
            return this.getMusic();
        }
        return null;
    }

}

// ---------------------------------------------------------------------------
// End-Of-File
// ---------------------------------------------------------------------------
