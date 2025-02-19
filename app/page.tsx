"use client"

import { useState, useRef, useEffect } from "react"
import { createClient } from "@supabase/supabase-js"
import { v4 as uuidv4 } from "uuid"
import lamejs from "lamejs"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseKey, {
  realtime: true,
})

export default function Home() {
  const [isRecording, setIsRecording] = useState(false)
  const [audioURL, setAudioURL] = useState<string | null>(null)
  const [notes, setNotes] = useState<any[]>([])
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Int16Array[]>([])

  useEffect(() => {
    const fetchNotes = async () => {
      const { data, error } = await supabase.from("notes").select("*").order("created_at", { ascending: false })

      if (data) setNotes(data)
    }

    fetchNotes()

    const channel = supabase
      .channel("notes_channel")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notes" }, (payload) => {
        setNotes((currentNotes) => [payload.new, ...currentNotes])
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const options = { mimeType: "audio/webm" }
      mediaRecorderRef.current = new MediaRecorder(stream, options)

      const encoder = new lamejs.Mp3Encoder(lamejs.MPEGMode.MONO, 44100, 128)

      mediaRecorderRef.current.ondataavailable = async (e) => {
        if (e.data.size > 0) {
          const arrayBuffer = await e.data.arrayBuffer()
          // Convert to 16-bit PCM data
          const int16Array = new Int16Array(arrayBuffer)
          chunksRef.current.push(int16Array)
        }
      }

      mediaRecorderRef.current.onstop = () => {
        const mp3Data: Int8Array[] = []

        // Process chunks in smaller segments to avoid memory issues
        for (const chunk of chunksRef.current) {
          const sampleSize = 1152 // This is the standard MP3 frame size
          for (let i = 0; i < chunk.length; i += sampleSize) {
            const samples = chunk.slice(i, i + sampleSize)
            const mp3buf = encoder.encodeBuffer(samples)
            if (mp3buf.length > 0) {
              mp3Data.push(new Int8Array(mp3buf))
            }
          }
        }

        // Flush the encoder
        const mp3buf = encoder.flush()
        if (mp3buf.length > 0) {
          mp3Data.push(new Int8Array(mp3buf))
        }

        const blob = new Blob(mp3Data, { type: "audio/mp3" })
        const url = URL.createObjectURL(blob)
        setAudioURL(url)
        uploadToSupabase(blob)

        // Clear the chunks
        chunksRef.current = []
      }

      mediaRecorderRef.current.start(1000) // Collect data every second
      setIsRecording(true)
    } catch (error) {
      console.error("Error starting recording:", error)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop())
      setIsRecording(false)
    }
  }

  const uploadToSupabase = async (blob: Blob) => {
    const fileName = `${uuidv4()}.mp3`
    const { data, error } = await supabase.storage.from("audio-files").upload(fileName, blob)

    if (error) {
      console.error("Error uploading file:", error)
    } else {
      console.log("File uploaded successfully:", data)
      processAudio(fileName)
    }
  }

  const processAudio = async (fileName: string) => {
    const response = await fetch("/api/process-audio", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fileName }),
    })

    if (!response.ok) {
      console.error("Error processing audio")
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
      <h1 className="text-4xl font-bold mb-8">Äänimuistiinpanot</h1>
      <div className="space-x-4 mb-8">
        <button
          onClick={isRecording ? stopRecording : startRecording}
          className={`px-4 py-2 rounded ${
            isRecording ? "bg-red-500 hover:bg-red-600" : "bg-blue-500 hover:bg-blue-600"
          } text-white font-semibold`}
        >
          {isRecording ? "Lopeta tallennus" : "Aloita tallennus"}
        </button>
      </div>
      {audioURL && (
        <audio className="mb-8" src={audioURL} controls>
          Selaimesi ei tue audio-elementtiä.
        </audio>
      )}
      <div className="w-full max-w-2xl">
        <h2 className="text-2xl font-semibold mb-4">Muistiinpanot</h2>
        {notes.map((note) => (
          <div key={note.id} className="bg-white p-4 rounded shadow mb-4">
            <h3 className="font-semibold mb-2">Yhteenveto</h3>
            <p>{note.summary}</p>
            <h3 className="font-semibold mt-4 mb-2">Transkriptio</h3>
            <p>{note.transcription}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

