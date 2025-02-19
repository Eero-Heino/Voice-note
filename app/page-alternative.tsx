"use client"

import { Mp3Encoder, MPEGMode } from "lamejs"

const encoder = new Mp3Encoder(MPEGMode.STEREO, 44100, 128)

