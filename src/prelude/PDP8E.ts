/*
 *   Yamas - Yet Another Macro Assembler (for the PDP-8)
 *   Copyright (C) 2023 Folke Will <folko@solhost.org>
 *
 *   This program is free software: you can redistribute it and/or modify
 *   it under the terms of the GNU Affero General Public License as published by
 *   the Free Software Foundation, either version 3 of the License, or
 *   (at your option) any later version.
 *
 *   This program is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *   GNU Affero General Public License for more details.
 *
 *   You should have received a copy of the GNU Affero General Public License
 *   along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

export const Prelude8E = `
    / CPU
    SKON=6000
    GTF=6004
    RTF=6005
    SGT=6006
    CAF=6007

    / GROUP 1 MICROINSTRUCTIONS
    BSW=7002

    / GROUP 3 MICROINSTRUCTIONS
    MQL=7421
    MQA=7501
    SWP=7521

    / IOP 0
    RPE=6010
    PCE=6020
    KCF=6030
    TFL=6040

    FIXTAB
`;
