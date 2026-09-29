export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

  // 1. PROVIDERS & KEYS POOL (Read from Vercel Env)
  const geminiKeys = [
    process.env.GEMINI_KEY_1,
    process.env.GEMINI_KEY_2,
    process.env.GEMINI_KEY_3,
    process.env.GEMINI_KEY_4
  ].filter(Boolean);

  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const grokKey = process.env.GROK_API_KEY;
  const mistralKey = process.env.MISTRAL_API_KEY;
  const huggingFaceKey = process.env.HUGGINGFACE_API_KEY;

  // Generic Caller with Fallback
  async function queryLLM(systemPrompt, userPrompt) {
    // 1. Try Gemini Keys sequentially
    for (let i = 0; i < geminiKeys.length; i++) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKeys[i]}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${systemPrompt}\n\nTask:\n${userPrompt}` }] }],
            generationConfig: { temperature: 0.2 }
          })
        });
        if (response.ok) {
          const data = await response.json();
          return { text: data.candidates[0].content.parts[0].text, provider: `Gemini Key #${i + 1}` };
        }
      } catch (e) {}
    }

    // 2. Fallback: Grok (xAI)
    if (grokKey) {
      try {
        const response = await fetch('https://api.x.ai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${grokKey}` },
          body: JSON.stringify({
            model: 'grok-beta',
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }]
          })
        });
        if (response.ok) {
          const data = await response.json();
          return { text: data.choices[0].message.content, provider: 'Grok xAI' };
        }
      } catch (e) {}
    }

    // 3. Fallback: Mistral AI
    if (mistralKey) {
      try {
        const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${mistralKey}` },
          body: JSON.stringify({
            model: 'mistral-large-latest',
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }]
          })
        });
        if (response.ok) {
          const data = await response.json();
          return { text: data.choices[0].message.content, provider: 'Mistral' };
        }
      } catch (e) {}
    }

    // 4. Fallback: OpenRouter (DeepSeek / Free Models)
    if (openRouterKey) {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openRouterKey}` },
          body: JSON.stringify({
            model: 'deepseek/deepseek-chat',
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }]
          })
        });
        if (response.ok) {
          const data = await response.json();
          return { text: data.choices[0].message.content, provider: 'OpenRouter' };
        }
      } catch (e) {}
    }

    // 5. Fallback: Hugging Face Router
    if (huggingFaceKey) {
      try {
        const response = await fetch('https://api-inference.huggingface.co/models/meta-llama/Llama-3.3-70B-Instruct/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${huggingFaceKey}` },
          body: JSON.stringify({
            model: 'meta-llama/Llama-3.3-70B-Instruct',
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }]
          })
        });
        if (response.ok) {
          const data = await response.json();
          return { text: data.choices[0].message.content, provider: 'HuggingFace Llama' };
        }
      } catch (e) {}
    }

    throw new Error('All AI providers and failover keys exhausted.');
  }

  try {
    // STAGE 1: Architect (Designs structure & logic)
    const architectPlan = await queryLLM(
      "You are a Software Architect. Break down the user app idea into: 1. Core Logic, 2. UI Components (Tailwind), 3. State Management. Be concise.",
      prompt
    );

    // STAGE 2: Lead Coder (Writes full HTML5 single-file code)
    const rawCode = await queryLLM(
      "You are a Lead Frontend Engineer. Using the architecture plan, output ONLY a fully working, self-contained, production-grade index.html with Tailwind CSS and Vanilla JS. Zero explanations, zero markdown backticks. Direct HTML only.",
      `Plan:\n${architectPlan.text}\n\nOriginal Request:\n${prompt}`
    );

    // STAGE 3: Reviewer & Polisher (Removes bugs, ensures complete code)
    const finalPolishedCode = await queryLLM(
      "You are a Senior Code Reviewer. Inspect this HTML/JS code. Ensure there are no broken tags, all scripts are intact, responsive on mobile & desktop, and remove any leftover markdown backticks (```html). Return ONLY raw clean HTML.",
      rawCode.text
    );

    let cleanCode = finalPolishedCode.text.trim();
    if (cleanCode.startsWith('```')) {
      cleanCode = cleanCode.replace(/^```(?:html)?\n?/, '').replace(/\n?```$/, '');
    }

    return res.status(200).json({
      success: true,
      code: cleanCode,
      stages: [
        { stage: "Architecture & Wireframe", provider: architectPlan.provider },
        { stage: "Code Synthesis", provider: rawCode.provider },
        { stage: "Review & Hardening", provider: finalPolishedCode.provider }
      ]
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
