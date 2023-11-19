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

export const PreludeIO = `
    / HIGH SPEED TAPE READER
    RSF=6011
    RRB=6012
    RFC=6014

    / HIGH SPEED TAPE PUNCH
    PSF=6021
    PCF=6022
    PPC=6024
    PLS=6026

    / TELETYPE KEYBOARD
    KSF=6031
    KCC=6032
    KRS=6034
    KIE=6035
    KRB=6036

    / TELETYPE PUNCH
    TSF=6041
    TCF=6042
    TPC=6044
    TSK=6045
    TLS=6046

    / DECTAPE
    DTRA=6761
    DTCA=6762
    DTXA=6764
    DTLA=6766
    DTSF=6771
    DTRB=6772
    DTLB=6774

    / DF32
    DCMA=6601
    DMAR=6603
    DMAW=6605
    DCEA=6611
    DSAC=6612
    DEAL=6615
    DEAC=6616
    DFSE=6621
    DFSC=6622
    DMAC=6626

    FIXTAB
`;
