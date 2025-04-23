import React, { useState } from "react";
import { useForm } from "react-hook-form";
import Tesseract from "tesseract.js";
import { getDocument } from "pdfjs-dist";
import "pdfjs-dist/build/pdf.worker.entry";
import axios from "axios";
import toast from "react-hot-toast";

const App = () => {
  const { register, handleSubmit, reset, formState: { errors } } = useForm();
  const [loading, setLoading] = useState(false);

  const handleFileUpload = async (data) => {
    const file = data.file[0];
    if (!file) return;

    const { type } = file;
    setLoading(true);

    try {
      if (type === "application/pdf") {
        await processPDF(file);
      } else if (type.startsWith("image/")) {
        const imageUrl = URL.createObjectURL(file);
        await extractTextFromImage(imageUrl);
      } else {
        alert("Only PDF or image files are supported.");
      }
    } catch (error) {
      toast.error("File processing error" || error)
    } finally {
      setLoading(false);
    }
  };

  const processPDF = async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2 });

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: context, viewport }).promise;
    const imageUrl = canvas.toDataURL("image/png");

    await extractTextFromImage(imageUrl);
  };

  const extractTextFromImage = async (imageUrl) => {
    try {
      const result = await Tesseract.recognize(imageUrl, 'eng', {
        logger: (m) => console.log(m),
      });
      const rawText = result.data.text.trim();
      const prompt = `You are an AI assistant that extracts structured invoice data from the provided text. Analyse the provided text and only return JSON in this format:
    {
      "invoice_number": "",
      "supplier": "",
      "invoice_date": "",
      "due_date": "",
      "total_amount": 0,
      "currency": "",
      "description": "",
      "po": "",
      "IGST": "",
      "CGST": "",
      "SGST": ""
    }
    Text: ${rawText}`;
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: "gpt-4o-mini",
          messages: [{ role: 'user', content: prompt }],
        },
        //  header
      );

      let structuredData = response.data.choices[0].message.content.trim();
      if (structuredData.startsWith("```json")) {
        structuredData = structuredData.replace(/^```json\s*/, "").replace(/```$/, "").trim();
      }

      const jsonResponse = JSON.parse(structuredData);


      const sheetsResponse = await axios.post(
        'https://script.google.com/macros/s/AKfycbxWHS5Mj0KTAyDxMAEHabHobqHqdNe4y1lGKj1ZwH1fs0qtyNe-5uBUxk71ja8QcBc/exec',
        new URLSearchParams(jsonResponse).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      if (sheetsResponse.status === 200) {
        toast.success('Google Sheets Submission Successful');
        reset()
      } else {
        throw new Error('Failed to submit to Google Sheets');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'OCR or API error');
    }
  };

  return (
    <div className="max-w-xl mx-auto p-6 font-sans">
      <form onSubmit={handleSubmit(handleFileUpload)} className="space-y-4">
        <div>
          <label htmlFor="file" className="block font-medium mb-1">
            Upload File (Image or PDF) <span className="text-red-500">*</span>
          </label>
          <input
            type="file"
            id="file"
            accept=".pdf, image/*"
            {...register("file", { required: "File is required" })}
            className={`w-full border rounded px-3 py-2 ${errors.file ? "border-red-500" : "border-gray-300"}`}
          />
          {errors.file && (
            <p className="text-sm text-red-500 mt-1">{errors.file.message}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition disabled:opacity-50"
        >
          {loading ? "Processing..." : "Extract Text"}
        </button>
      </form>

    </div>
  );
};

export default App;
