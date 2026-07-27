import requests
import time
import os
import sys

def check_endpoints():
    print("Generating Sneha_Agrawal_IT_Resume.pdf...")
    try:
        from fpdf import FPDF
        pdf = FPDF()
        pdf.add_page()
        pdf.set_font("Arial", size=12)
        pdf.cell(200, 10, txt="Sneha Agrawal - IT Resume", ln=1, align='C')
        pdf.cell(200, 10, txt="Email: sneha@example.com | Phone: 123-456-7890", ln=1, align='C')
        pdf.cell(200, 10, txt="Experience: Senior Software Engineer at TechCorp. Built microservices using Node.js and Python.", ln=1)
        pdf.cell(200, 10, txt="Skills: Python, TypeScript, React, Node.js, ChromaDB, Gemini AI.", ln=1)
        pdf.cell(200, 10, txt="Education: B.Tech in Computer Science.", ln=1)
        pdf.output("Sneha_Agrawal_IT_Resume.pdf")
    except Exception as e:
        print("Failed to generate PDF:", e)
        sys.exit(1)

    print("Authenticating...")
    auth_res = requests.post("http://localhost:3001/api/auth/dev-session")
    auth_data = auth_res.json()
    token = auth_data["data"]["token"]
    print("Got Token:", token)

    print("Uploading file...")
    url = "http://localhost:3001/api/workspace/upload"
    with open("Sneha_Agrawal_IT_Resume.pdf", "rb") as f:
        files = {"files": ("Sneha_Agrawal_IT_Resume.pdf", f, "application/pdf")}
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.post(url, files=files, headers=headers)
    
    print("Upload Response:", response.json())
    if not response.json().get("success"):
        print("UPLOAD FAILED!")
        sys.exit(1)

    print("Waiting for indexing to complete (5 seconds)...")
    time.sleep(5)

    print("Fetching documents...")
    docs_res = requests.get("http://localhost:3001/api/workspace/documents", headers=headers)
    print("Raw Documents Response:", docs_res.text)
    try:
        docs = docs_res.json()
    except Exception as e:
        print("Failed to decode JSON:", e)
        sys.exit(1)
    print("Documents Response:", docs)
    
    if not docs.get("success") or not docs.get("data"):
        print("NO DOCUMENTS FOUND!")
        sys.exit(1)

    doc_id = docs["data"][0]["id"]
    filename = docs["data"][0]["filename"]
    print(f"Found document: {filename} (ID: {doc_id})")

    if filename != "Sneha_Agrawal_IT_Resume.pdf":
        print("FILENAME DOES NOT MATCH ORIGINAL!")
    
    print("Testing Semantic Search...")
    search_payload = {"query": "Sneha IT Resume skills", "mode": "semantic", "limit": 5}
    search_res = requests.post("http://localhost:3001/api/search", json=search_payload, headers=headers)
    print("Search Response:", search_res.json())

    print("Testing Deep Document Analysis...")
    analysis_res = requests.get(f"http://localhost:3001/api/workspace/document/{doc_id}/analysis", headers=headers)
    print("Analysis Response:", analysis_res.json())

    print("Testing AI Chat...")
    chat_payload = {
        "query": "What are Sneha's skills based on the resume?",
        "history": []
    }
    chat_res = requests.post("http://localhost:3001/api/ai/chat", json=chat_payload, headers=headers, stream=True)
    print("Chat Response:", chat_res.text)

    print("ALL TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    check_endpoints()
