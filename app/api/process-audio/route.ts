import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import fetch from "node-fetch"
import { Configuration, OpenAIApi } from "openai"

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const openai = new OpenAIApi(
  new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
  }),
)

export const config = {
  runtime: "edge",
}

export async function POST(req: Request) {
  const { fileName } = await req.json()

  // Hae tiedosto Supabase Storagesta
  const { data, error } = await supabase.storage.from("audio-files").download(fileName)

  if (error) {
    return NextResponse.json({ error: "Virhe tiedoston lataamisessa" }, { status: 500 })
  }

  // Lähetä Speechmaticsille
  const speechmaticsResponse = await fetch("https://asr.api.speechmatics.com/v2/jobs/", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SPEECHMATICS_API_KEY}`,
      "Content-Type": "multipart/form-data",
    },
    body: JSON.stringify({
      audio: data,
      transcription_config: {
        language: "fi",
        operating_point: "enhanced",
      },
    }),
  })

  const { id: jobId } = await speechmaticsResponse.json()

  // Odota tuloksia
  let transcription
  while (!transcription) {
    await new Promise((resolve) => setTimeout(resolve, 5000))
    const resultResponse = await fetch(`https://asr.api.speechmatics.com/v2/jobs/${jobId}`, {
      headers: {
        Authorization: `Bearer ${process.env.SPEECHMATICS_API_KEY}`,
      },
    })
    const result = await resultResponse.json()
    if (result.status === "done") {
      transcription = result.transcripts[0].transcript
    }
  }

  // Tiivistä OpenAI:n avulla
  const completion = await openai.createCompletion({
    model: "text-davinci-002",
    prompt: `Tiivistä seuraava teksti selkeiksi muistiinpanoiksi:\n\n${transcription}`,
    max_tokens: 150,
  })

  const summary = completion.data.choices[0].text

  // Tallenna Supabaseen
  const { data: noteData, error: noteError } = await supabase.from("notes").insert({ transcription, summary })

  if (noteError) {
    return NextResponse.json({ error: "Virhe muistiinpanon tallentamisessa" }, { status: 500 })
  }

  return NextResponse.json({ success: true, noteId: noteData[0].id })
}

