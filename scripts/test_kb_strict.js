const testQueries = [
  // In-scope queries (must reply from business data)
  'What is your website link?',
  'Can I broadcast from Google Sheets?',
  'Tell me about your services and features',
  
  // Out-of-scope queries (MUST NOT reply)
  'Who is the president of France?',
  'Can you write a python script for binary search?',
  'Tell me a funny joke',
  'What is the recipe for chocolate cake?'
];

(async () => {
  console.log('Testing Knowledge Base Strict Boundaries:\n');
  for (const q of testQueries) {
    try {
      const res = await fetch('http://localhost:3000/api/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: q, phone: '919876543210' })
      });
      const data = await res.json();
      console.log(`Query: "${q}"`);
      console.log(`  -> Replied: ${data.replied}`);
      console.log(`  -> Response: ${data.aiReply || '(Silent - No reply sent)'}`);
      console.log(`  -> Note: ${data.note}\n`);
    } catch (err) {
      console.error('Error testing query:', q, err.message);
    }
  }
})();

