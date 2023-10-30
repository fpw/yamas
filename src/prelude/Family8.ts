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

export const PreludeFamily8 = `
    / MEMORY REFERENCE INSTRUCTIONS
    AND=0000
    TAD=1000
    ISZ=2000
    DCA=3000
    JMS=4000
    JMP=5000
    IOT=6000
    OPR=7000

    / GROUP 1 MICROINSTRUCTIONS
    NOP=7000
    IAC=7001
    RAL=7004
    RTL=7006
    RAR=7010
    RTR=7012
    CML=7020
    CMA=7040
    CLL=7100
    CLA=7200

    / GROUP 2 MICROINSTRUCTIONS
    HLT=7402
    OSR=7404
    SKP=7410
    SNL=7420
    SZL=7430
    SZA=7440
    SNA=7450
    SMA=7500
    SPA=7510

    / COMBINED MICROINSTRUCTIONS
    CIA=7041
    STL=7120
    GLK=7204
    STA=7240
    LAS=7604

    / PROGRAM INTERRUPT
    ION=6001
    IOF=6002

    / MEMORY EXTENSION
    RDF=6214
    RIF=6224
    RMF=6244
    RIB=6234
    CDF=6201
    CIF=6202

    FIXTAB
`;
