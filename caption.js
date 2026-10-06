// Instagram captions in the NGN format (from the team's caption prompt, NGN_Caption_Prompt.md).
// Captions.template(story) builds the closing block with the photo credit filled in from the site;
// Captions.claudeUrl(story) opens Claude with the caption prompt and the article so it drafts the copy.
window.Captions = (() => {
  const PROMPT = "NGN CAPTION PROMPT\n\nYou write Instagram captions for Northeastern Global News (NGN). Captions are drawn from Northeastern News articles (news.northeastern.edu) covering faculty and student research, campus events, alumni and student profiles, co-op and career stories, and institutional announcements. The goal is click-throughs to the full article while keeping a consistent, polished institutional voice.\n\nWORKFLOW\n- I'll usually share an article URL. Fetch it and draft a caption in the format below.\n- Expect iterative edits: tightening, cutting extraneous lines, reworking openers, and fitting platform limits (e.g., 280 characters for X).\n- I may share my own edits or example captions. Treat them as models for tone and structure in future drafts.\n\nSTRUCTURE AND VOICE\n- Two paragraphs. Paragraph one opens with a hook fact, scene-setter, or AP-style lead. Paragraph two adds storytelling detail and typically carries expert attribution (e.g., \"@Northeastern experts\" or named faculty). The @Northeastern tag can appear wherever it fits naturally.\n- A thematic hook first (a punchy topical line before the AP-style facts) is acceptable case by case.\n- Intrigue, don't summarize. Leave readers a reason to click.\n- Don't repeat key words across paragraphs. Keep copy tight and paraphrased, never verbatim from the source article.\n- AP style throughout: lowercase generic titles (e.g., \"dean\") unless they directly precede a name; \"close-up\" is hyphenated when describing photography.\n- Student-profile pieces can skip the expert paragraph if the article doesn't support one.\n- For Q&A articles quoting a single source, attribute to that source by name rather than \"@Northeastern experts.\"\n- Avoid over-explaining, unnecessary biographical detail, front-loading article content, and misattributed quotes.\n\nCLOSING BLOCK (exact format)\n[Caption copy]\n\n🔗 Read more at the link in bio.\n...\n📷: @[photo credit]\n.\n.\n.\n#NortheasternUniversity #Hashtag1 #Hashtag2 #Hashtag3\n\n- Leave one blank line between the caption copy and the 🔗 line.\n- Use three single dots, each on its own line, before the hashtag line.\n\nPHOTO CREDITS\n- Use \"@handle\" only, not \"Name/Handle.\"\n- Use \"Courtesy photo\" when no handle is available.\n- Alyssa Stone's handle is @alysstone (not @alyssastone).\n- If the photographer's handle isn't known, leave a placeholder and flag it rather than guessing.\n\nHASHTAGS\n- #NortheasternUniversity always comes first, followed by 2–3 relevant thematic tags (3–4 total).\n\nCROSS-POSTING AND EXTERNAL PRESS\n- When reposting across campus accounts, don't repeat the original post's content, and use phrasing that doesn't diminish other campuses' contributions.\n- For carousels amplifying external press (e.g., Boston Globe, Business Insider), the caption and slide copy should convey different information.\n\nQUOTING AND FAIR USE\n- Default to paraphrase. One quote per source is a conservative internal heuristic.\n- Removing quotation marks doesn't turn verbatim text into a paraphrase.\n- Northeastern employing a quoted speaker doesn't grant rights to reuse another outlet's text.\n- Coined terms (e.g., \"AI orchestrators\") don't count against the quote budget.";

  // Photographer handles, confirmed against @northeasternglobalnews captions and the matching stories' photo credits.
  const HANDLES = {
    'Alyssa Stone': '@alysstone',
    'Matthew Modoono': '@modoonophoto',
    'Ruby Wallau': '@rubywallau',
  };

  // The credit from the featured image's caption on the site, as the line after 📷.
  // An unknown photographer gets a placeholder and a flag rather than a guessed handle.
  function credit(captionHtml) {
    const t = new DOMParser().parseFromString(captionHtml || '', 'text/html').body.textContent.replace(/\s+/g, ' ');
    const by = t.match(/Photos? by ([A-Z][^/,.()]*?)\s*(?:\/|\sfor\s|,|\.|\(|$)/);
    if (by) {
      const name = by[1].trim();
      return HANDLES[name] ? { line: HANDLES[name] } : { line: `@[${name}’s handle]`, flag: `The site credits ${name}; their handle isn’t on file. Fill it in before posting.` };
    }
    if (/courtesy/i.test(t)) return { line: 'Courtesy photo' };
    const agency = t.match(/\(([^)]*(?:AP|Getty|Reuters|AFP)[^)]*)\)/);
    if (agency) return { line: '@[photo credit]', flag: `Agency photo (${agency[1]}). Confirm how to credit it.` };
    return { line: '@[photo credit]', flag: 'No photo credit on the site. Add the photographer’s handle, or “Courtesy photo”.' };
  }

  const template = (c) => `[Caption copy: two short paragraphs. Use Write with Claude, or write it here.]

🔗 Read more at the link in bio.
...
📷: ${c.line}
.
.
.
#NortheasternUniversity #Hashtag1 #Hashtag2`;

  function message(link, c) {
    return `${PROMPT}

---

Article: ${link}
Use this photo credit line: 📷: ${c.line}${c.flag ? ` (${c.flag})` : ''}

Draft the caption.`;
  }

  // Published @northeasternglobalnews captions, given to Claude as models for tone and structure (the prompt invites this).
  const EXAMPLES = ["Could the future of microchip manufacturing be in orbit? @Northeastern student Rhea Dharia spent her co-op helping find out, with work that hitched a ride on a SpaceX rocket.\n\nAs a payload specialist at Besxar Space Industries, the mechanical engineering and bioengineering major helped design reusable canisters that would harness the vacuum of space to produce purer semiconductor material. Each one had to withstand the violent trip up and back down.\n\n🔗 Read more at the link in bio.\n...\n📷: @alysstone, Courtesy Photo\n.\n.\n.\n#NortheasternUniversity #CoOp #Aerospace", "Northeastern professor Ning Wang found that many cells carry \"mechanical memory,\" continuing to react to physical force like exercise long after it's stopped — a discovery he demonstrated by agitating hamster cells in short bursts that matched an hour of continuous stimulation.\n\nWang said stimulating fibroblast cells could boost collagen production and restore youthful elasticity, while similar mechanisms could help older adults or those with limited mobility get more from brief exercise.\n\n🔗 Read more at the link in bio.\n...\n📷: @modoonophoto\n.\n.\n.\n#NortheasternUniversity #Research #Bioengineering #Science", "David Ayman Shamma, director of computing programs at @NUOakland, has spent more than two decades researching AI at NASA, Flickr and Toyota. Now, he's setting his sights on the next era of AI — and predicting that all-purpose models may soon outgrow their usefulness.\n\nShamma said he sees two shifts ahead: more AI running on-device rather than in the cloud, and a move away from massive general-purpose models toward smaller, specialized ones built around real user needs.\n\n🔗 Read more at the link in bio.\n...\n📷: @rubywallau\n.\n.\n.\n#NortheasternUniversity #AI #Computing"];
  const SYSTEM = `${PROMPT}

The article's text comes in the message, so there is nothing to fetch. Reply with the finished caption only, ready to paste into Instagram: no preamble, no notes, no markdown.

Published captions to model tone and structure on:

${EXAMPLES.map((e, i) => `<example ${i + 1}>\n${e}\n</example ${i + 1}>`).join('\n\n')}`;

  // Write the caption with the Claude API, straight from the browser with the viewer's own key (stored only in their
  // browser; never in this repo). Official SDK from a pinned CDN build, loaded on first use.
  let Anthropic;
  async function generate({ apiKey, title, link, text, credit: c }) {
    Anthropic ??= (await import('https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.131.0/+esm')).default;
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
    try {
      const response = await client.beta.messages.create({
        model: 'claude-opus-5-5',
        max_tokens: 16000,
        output_config: { effort: 'medium' },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default', // a declined request is retried on a fallback model in the same call
        system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
        messages: [{
          role: 'user',
          content: `Article: ${title}\n${link}\n\n${text}\n\nPhoto credit line to use: 📷: ${c.line}${c.flag ? ` (${c.flag} Keep the placeholder.)` : ''}\n\nWrite the caption.`,
        }],
      });
      if (response.stop_reason === 'refusal') throw new Error('Claude declined to write this caption. Write it by hand, or try again.');
      const caption = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
      if (!caption) throw new Error('Claude returned an empty caption. Try again.');
      return caption;
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) throw new Error('That API key was rejected. Check it under “API key”.');
      if (err instanceof Anthropic.PermissionDeniedError) throw new Error('That API key can’t use this model. Ask whoever manages the key.');
      if (err instanceof Anthropic.RateLimitError) throw new Error('Too many requests right now. Wait a minute and try again.');
      if (err instanceof Anthropic.APIConnectionError) throw new Error('Couldn’t reach the Claude API. Check your connection.');
      if (err instanceof Anthropic.APIError) throw new Error(`The Claude API returned an error (${err.status}). Try again.`);
      throw err;
    }
  }

  // claude.ai prefills a new chat from ?q=; the same text also goes on the clipboard in case it doesn't.
  const claudeUrl = (link, c) => `https://claude.ai/new?q=${encodeURIComponent(message(link, c))}`;

  return { credit, template, message, claudeUrl, generate };
})();
