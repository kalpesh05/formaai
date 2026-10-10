import { Router, Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest, authenticateAgency, assertWorkspaceBelongsToAgency } from '../middleware/auth';
import { query } from '../config/db';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import http from 'http';

dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const router = Router();

const asyncHandler = (fn: (req: any, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: any, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
};

/**
 * Helper to fetch IP Geolocation safely without external dependencies
 */
async function resolveIpLocation(ip: string): Promise<{ country?: string; countryCode?: string; region?: string; city?: string; timezone?: string }> {
  // Normalize localhost and private networks
  if (!ip || ip === '::1' || ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.16.')) {
    return { country: 'Localhost / Dev', countryCode: 'LOCAL', city: 'Development', timezone: 'UTC' };
  }

  // Clean ipv6 mapped ipv4
  const cleanIp = ip.replace(/^::ffff:/, '');

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve({});
    }, 1500);

    const req = http.get(`http://ip-api.com/json/${cleanIp}?fields=status,country,countryCode,regionName,city,timezone`, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        clearTimeout(timeout);
        try {
          const parsed = JSON.parse(data);
          if (parsed.status === 'success') {
            resolve({
              country: parsed.country,
              countryCode: parsed.countryCode,
              region: parsed.regionName,
              city: parsed.city,
              timezone: parsed.timezone,
            });
          } else {
            resolve({});
          }
        } catch {
          resolve({});
        }
      });
    });

    req.on('error', () => {
      clearTimeout(timeout);
      resolve({});
    });
  });
}

/* ===================================================================================
   PUBLIC RESPONDENT ENDPOINTS (NO AUTH REQUIRED)
   =================================================================================== */

/**
 * GET /api/v1/forms/public/:formId
 * Fetch public-facing form definition for respondents.
 */
router.get('/public/:formId', asyncHandler(async (req: Request, res: Response) => {
  const { formId } = req.params;

  const result = await query(
    `SELECT id, title, description, display_mode, fields, settings, is_published, created_at
     FROM forms
     WHERE id = $1`,
    [formId]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Form not found' });
  }

  const form = result.rows[0];

  if (!form.is_published) {
    return res.status(403).json({ error: 'This form is currently not accepting responses' });
  }

  return res.json({
    id: form.id,
    title: form.title,
    description: form.description,
    display_mode: form.display_mode || 'classic',
    fields: form.fields || [],
    settings: {
      brand_color: form.settings?.brand_color || '#2563eb',
      logo_url: form.settings?.logo_url || null,
      theme: form.settings?.theme || 'light',
      submit_button_text: form.settings?.submit_button_text || 'Submit',
      thank_you_title: form.settings?.thank_you_title || 'Thank you!',
      thank_you_message: form.settings?.thank_you_message || 'Your submission has been received.',
      redirect_url: form.settings?.redirect_url || null,
      show_forma_badge: form.settings?.show_forma_badge !== false,
    },
    created_at: form.created_at,
  });
}));

/**
 * POST /api/v1/forms/public/:formId/submit
 * Submit answers from respondents and track IP, timezone, and geolocation metadata.
 */
router.post('/public/:formId/submit', asyncHandler(async (req: Request, res: Response) => {
  const { formId } = req.params;
  const { answers = {}, client_metadata = {} } = req.body;

  // Retrieve form and verify published
  const formRes = await query(
    `SELECT id, client_workspace_id, title, fields, settings, is_published FROM forms WHERE id = $1`,
    [formId]
  );

  if (formRes.rows.length === 0) {
    return res.status(404).json({ error: 'Form not found' });
  }

  const form = formRes.rows[0];

  if (!form.is_published) {
    return res.status(403).json({ error: 'This form is currently closed' });
  }

  // Sniff IP and client context
  const forwarded = req.headers['x-forwarded-for'];
  const rawIp = (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : req.socket.remoteAddress) || '';
  const userAgent = req.headers['user-agent'] || 'Unknown';
  const referrer = req.headers['referer'] || req.headers['referrer'] || client_metadata?.referrer || null;

  // Geolocation detection
  let geoInfo = await resolveIpLocation(rawIp);

  // Fallback to Cloudflare or proxy headers if present
  const cfCountry = req.headers['cf-ipcountry'] as string | undefined;
  if (cfCountry && (!geoInfo.countryCode || geoInfo.countryCode === 'LOCAL')) {
    geoInfo.countryCode = cfCountry;
    geoInfo.country = cfCountry;
  }

  // Client timezone from browser Intl.DateTimeFormat if provided
  const finalTimezone = client_metadata?.timezone || geoInfo.timezone || 'UTC';

  const metadata = {
    ip: rawIp ? rawIp.replace(/^::ffff:/, '') : 'Unknown',
    country: geoInfo.country || client_metadata?.country || 'Unknown',
    country_code: geoInfo.countryCode || client_metadata?.country_code || '',
    region: geoInfo.region || '',
    city: geoInfo.city || client_metadata?.city || 'Unknown',
    timezone: finalTimezone,
    user_agent: userAgent,
    referrer: referrer,
    device: /Mobile|Android|iP(hone|od|ad)/i.test(userAgent) ? 'Mobile' : 'Desktop',
    submitted_at: new Date().toISOString(),
  };

  // Insert submission
  const insertRes = await query(
    `INSERT INTO form_submissions (
       form_id, client_workspace_id, answers, metadata, status
     )
     VALUES ($1, $2, $3, $4, 'new')
     RETURNING id, created_at`,
    [form.id, form.client_workspace_id, JSON.stringify(answers), JSON.stringify(metadata)]
  );

  return res.status(201).json({
    success: true,
    submission_id: insertRes.rows[0].id,
    thank_you_title: form.settings?.thank_you_title || 'Thank you!',
    thank_you_message: form.settings?.thank_you_message || 'Your submission has been received.',
    redirect_url: form.settings?.redirect_url || null,
  });
}));

/* ===================================================================================
   AUTHENTICATED WORKSPACE ENDPOINTS
   =================================================================================== */

/**
 * GET /api/v1/workspaces/:wsId/forms
 * List all forms for a workspace with submission count and recent activity.
 */
router.get(
  '/workspaces/:wsId/forms',
  authenticateAgency,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { wsId } = req.params;
    await assertWorkspaceBelongsToAgency(wsId, req.agencyId!);

    const result = await query(
      `SELECT f.id, f.title, f.description, f.display_mode, f.fields, f.settings, f.is_published,
              f.created_at, f.updated_at,
              COALESCE(COUNT(fs.id), 0)::int AS submission_count,
              MAX(fs.created_at) AS last_submission_at
       FROM forms f
       LEFT JOIN form_submissions fs ON f.id = fs.form_id
       WHERE f.client_workspace_id = $1
       GROUP BY f.id
       ORDER BY f.updated_at DESC`,
      [wsId]
    );

    return res.json(result.rows);
  })
);

/**
 * POST /api/v1/workspaces/:wsId/forms
 * Create a new form in workspace.
 */
router.post(
  '/workspaces/:wsId/forms',
  authenticateAgency,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { wsId } = req.params;
    await assertWorkspaceBelongsToAgency(wsId, req.agencyId!);

    // Enforce plan limits and beta module access
    const { checkFormCreationAllowed } = await import('../utils/planLimits');
    const check = await checkFormCreationAllowed(wsId);
    if (!check.allowed) {
      return res.status(403).json({
        error: check.error,
        code: check.code,
        current: check.current,
        limit: check.limit,
        plan_tier: check.plan_tier,
      });
    }

    const {
      title,
      description = '',
      display_mode = 'classic',
      fields = [],
      settings = {},
      is_published = true,
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Form title is required' });
    }

    const defaultSettings = {
      brand_color: '#2563eb',
      theme: 'light',
      submit_button_text: 'Submit Response',
      thank_you_title: 'Thank you!',
      thank_you_message: 'Your response has been successfully recorded.',
      show_forma_badge: true,
      ...settings,
    };

    const result = await query(
      `INSERT INTO forms (
         client_workspace_id, title, description, display_mode, fields, settings, is_published
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [wsId, title.trim(), description, display_mode, JSON.stringify(fields), JSON.stringify(defaultSettings), is_published]
    );

    return res.status(201).json(result.rows[0]);
  })
);

/**
 * POST /api/v1/workspaces/:wsId/forms/ai-generate
 * Generate form schema, title, and questions dynamically with Gemini AI based on user intent.
 */
router.post(
  '/workspaces/:wsId/forms/ai-generate',
  authenticateAgency,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { wsId } = req.params;
    await assertWorkspaceBelongsToAgency(wsId, req.agencyId!);

    const { prompt } = req.body;

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ error: 'Prompt is required to generate a form' });
    }

    if (!GEMINI_API_KEY || GEMINI_API_KEY.startsWith('replace_this')) {
      // Mock generation fallback for local offline testing
      return res.json({
        title: 'Customer Feedback & Intake Form',
        description: `Generated based on: "${prompt}"`,
        display_mode: 'one_by_one',
        fields: [
          { id: 'f_name', type: 'short_text', label: 'What is your full name?', placeholder: 'John Doe', required: true },
          { id: 'f_email', type: 'email', label: 'What is your email address?', placeholder: 'john@example.com', required: true },
          { id: 'f_category', type: 'dropdown', label: 'Which service are you interested in?', required: true, options: ['Consulting', 'Custom AI Agent', 'Web Development', 'Other'] },
          { id: 'f_budget', type: 'multiple_choice', label: 'What is your estimated timeline or budget?', required: false, options: ['Under $1,000', '$1,000 - $5,000', '$5,000+', 'Flexible'] },
          { id: 'f_rating', type: 'rating', label: 'How urgent is this project for your business?', required: true },
          { id: 'f_details', type: 'long_text', label: 'Please share any specific goals or notes with our team.', placeholder: 'Type your message...', required: false },
        ]
      });
    }

    try {
      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

      const systemInstruction = `You are an expert UX and Form Design Architect for Forma AI SaaS.
Given a user's request, create a clean, modern form with the optimal fields.
Valid field types:
- 'short_text' (for single-line text like names, titles)
- 'long_text' (for paragraphs, feedback, notes)
- 'email' (for email addresses)
- 'phone' (for telephone numbers)
- 'number' (for numeric inputs, age, quantity)
- 'dropdown' (for single selection from 4+ choices; must include 'options' string array)
- 'multiple_choice' (for single or multi-select cards; must include 'options' string array)
- 'rating' (for 1 to 5 star rating or satisfaction score)
- 'date' (for date scheduling, birthdays, event dates)

Output ONLY valid JSON with no markdown backticks, with the following exact shape:
{
  "title": "string",
  "description": "string",
  "display_mode": "classic" | "one_by_one",
  "fields": [
    {
      "id": "string (unique snake_case ID like f_1, f_email)",
      "type": "string (one of the valid types above)",
      "label": "string (engaging question label)",
      "placeholder": "string (helpful placeholder)",
      "required": boolean,
      "options": ["Option 1", "Option 2"] (ONLY if dropdown or multiple_choice)
    }
  ]
}`;

      const aiResponse = await model.generateContent([
        systemInstruction,
        `Generate a professional form schema for: "${prompt}"`
      ]);

      const rawText = aiResponse.response.text();
      const cleanedJson = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanedJson);

      return res.json(parsed);
    } catch (err: any) {
      console.error('[AI FORM GENERATION ERROR]:', err);
      return res.status(500).json({ error: 'Failed to generate form with AI: ' + err.message });
    }
  })
);

/**
 * GET /api/v1/workspaces/:wsId/forms/:formId
 * Get specific form details.
 */
router.get(
  '/workspaces/:wsId/forms/:formId',
  authenticateAgency,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { wsId, formId } = req.params;
    await assertWorkspaceBelongsToAgency(wsId, req.agencyId!);

    const result = await query(
      `SELECT f.*,
              COALESCE(COUNT(fs.id), 0)::int AS submission_count
       FROM forms f
       LEFT JOIN form_submissions fs ON f.id = fs.form_id
       WHERE f.id = $1 AND f.client_workspace_id = $2
       GROUP BY f.id`,
      [formId, wsId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Form not found' });
    }

    return res.json(result.rows[0]);
  })
);

/**
 * PUT /api/v1/workspaces/:wsId/forms/:formId
 * Update form schema, layout, and settings.
 */
router.put(
  '/workspaces/:wsId/forms/:formId',
  authenticateAgency,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { wsId, formId } = req.params;
    await assertWorkspaceBelongsToAgency(wsId, req.agencyId!);

    const {
      title,
      description,
      display_mode,
      fields,
      settings,
      is_published,
    } = req.body;

    const existing = await query(
      `SELECT * FROM forms WHERE id = $1 AND client_workspace_id = $2`,
      [formId, wsId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Form not found' });
    }

    const current = existing.rows[0];

    const updatedTitle = title !== undefined ? title.trim() : current.title;
    const updatedDesc = description !== undefined ? description : current.description;
    const updatedDisplay = display_mode !== undefined ? display_mode : current.display_mode;
    const updatedFields = fields !== undefined ? JSON.stringify(fields) : JSON.stringify(current.fields);
    const updatedSettings = settings !== undefined ? JSON.stringify({ ...current.settings, ...settings }) : JSON.stringify(current.settings);
    const updatedPublished = is_published !== undefined ? is_published : current.is_published;

    const result = await query(
      `UPDATE forms
       SET title = $1,
           description = $2,
           display_mode = $3,
           fields = $4,
           settings = $5,
           is_published = $6,
           updated_at = now()
       WHERE id = $7 AND client_workspace_id = $8
       RETURNING *`,
      [updatedTitle, updatedDesc, updatedDisplay, updatedFields, updatedSettings, updatedPublished, formId, wsId]
    );

    return res.json(result.rows[0]);
  })
);

/**
 * DELETE /api/v1/workspaces/:wsId/forms/:formId
 * Delete form and all associated submissions.
 */
router.delete(
  '/workspaces/:wsId/forms/:formId',
  authenticateAgency,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { wsId, formId } = req.params;
    await assertWorkspaceBelongsToAgency(wsId, req.agencyId!);

    const result = await query(
      `DELETE FROM forms WHERE id = $1 AND client_workspace_id = $2 RETURNING id`,
      [formId, wsId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Form not found' });
    }

    return res.json({ success: true, message: 'Form deleted successfully' });
  })
);

/**
 * GET /api/v1/workspaces/:wsId/forms/:formId/submissions
 * Fetch submissions for a form with search, status filtering, and pagination.
 */
router.get(
  '/workspaces/:wsId/forms/:formId/submissions',
  authenticateAgency,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { wsId, formId } = req.params;
    await assertWorkspaceBelongsToAgency(wsId, req.agencyId!);

    const { status, search, limit = '100', offset = '0' } = req.query;

    let sql = `SELECT * FROM form_submissions WHERE form_id = $1 AND client_workspace_id = $2`;
    const params: any[] = [formId, wsId];

    if (status && status !== 'all') {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }

    if (search && typeof search === 'string' && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      sql += ` AND LOWER(answers::text) LIKE $${params.length}`;
    }

    sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit as string, 10) || 100);
    params.push(parseInt(offset as string, 10) || 0);

    const result = await query(sql, params);

    // Total count for pagination
    const countRes = await query(
      `SELECT COUNT(*)::int AS total FROM form_submissions WHERE form_id = $1 AND client_workspace_id = $2`,
      [formId, wsId]
    );

    return res.json({
      submissions: result.rows,
      total: countRes.rows[0]?.total || 0,
    });
  })
);

/**
 * PATCH /api/v1/workspaces/:wsId/forms/:formId/submissions/:subId/status
 * Update status of a submission (new, reviewed, archived).
 */
router.patch(
  '/workspaces/:wsId/forms/:formId/submissions/:subId/status',
  authenticateAgency,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { wsId, formId, subId } = req.params;
    await assertWorkspaceBelongsToAgency(wsId, req.agencyId!);

    const { status } = req.body;

    if (!['new', 'reviewed', 'archived'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const result = await query(
      `UPDATE form_submissions
       SET status = $1
       WHERE id = $2 AND form_id = $3 AND client_workspace_id = $4
       RETURNING *`,
      [status, subId, formId, wsId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    return res.json(result.rows[0]);
  })
);

/**
 * DELETE /api/v1/workspaces/:wsId/forms/:formId/submissions/:subId
 * Delete single submission.
 */
router.delete(
  '/workspaces/:wsId/forms/:formId/submissions/:subId',
  authenticateAgency,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { wsId, formId, subId } = req.params;
    await assertWorkspaceBelongsToAgency(wsId, req.agencyId!);

    const result = await query(
      `DELETE FROM form_submissions
       WHERE id = $1 AND form_id = $2 AND client_workspace_id = $3
       RETURNING id`,
      [subId, formId, wsId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    return res.json({ success: true, message: 'Submission deleted' });
  })
);

/**
 * GET /api/v1/workspaces/:wsId/forms/:formId/analytics
 * Compute visual analytics: submission volume over time, categorical field breakdown,
 * rating averages, and geographic/timezone distributions.
 */
router.get(
  '/workspaces/:wsId/forms/:formId/analytics',
  authenticateAgency,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { wsId, formId } = req.params;
    await assertWorkspaceBelongsToAgency(wsId, req.agencyId!);

    // Fetch form definition
    const formRes = await query(
      `SELECT id, title, fields FROM forms WHERE id = $1 AND client_workspace_id = $2`,
      [formId, wsId]
    );

    if (formRes.rows.length === 0) {
      return res.status(404).json({ error: 'Form not found' });
    }

    const form = formRes.rows[0];
    const fields = form.fields || [];

    // Fetch all submissions for computation
    const subsRes = await query(
      `SELECT id, answers, metadata, status, created_at
       FROM form_submissions
       WHERE form_id = $1 AND client_workspace_id = $2
       ORDER BY created_at ASC`,
      [formId, wsId]
    );

    const submissions = subsRes.rows;
    const totalCount = submissions.length;

    // 1. Time-series daily submissions (last 14 days or grouped by date)
    const dailyMap: { [date: string]: number } = {};
    submissions.forEach((s) => {
      const dateKey = new Date(s.created_at).toISOString().split('T')[0];
      dailyMap[dateKey] = (dailyMap[dateKey] || 0) + 1;
    });

    const timeSeries = Object.keys(dailyMap).sort().map((date) => ({
      date,
      count: dailyMap[date],
    }));

    // 2. Field breakdown for categorical (dropdown, multiple_choice) and rating fields
    const categoricalStats: { [fieldId: string]: { label: string; type: string; counts: { [opt: string]: number } } } = {};
    const ratingStats: { [fieldId: string]: { label: string; avg: number; total: number; distribution: { [star: string]: number } } } = {};

    fields.forEach((f: any) => {
      if (['dropdown', 'multiple_choice'].includes(f.type)) {
        categoricalStats[f.id] = {
          label: f.label,
          type: f.type,
          counts: {},
        };
        if (Array.isArray(f.options)) {
          f.options.forEach((opt: string) => {
            categoricalStats[f.id].counts[opt] = 0;
          });
        }
      } else if (f.type === 'rating') {
        ratingStats[f.id] = {
          label: f.label,
          avg: 0,
          total: 0,
          distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
        };
      }
    });

    let ratingAccumulator: { [fieldId: string]: { sum: number; count: number } } = {};

    submissions.forEach((s) => {
      const answers = s.answers || {};

      // Categorical counts
      Object.keys(categoricalStats).forEach((fieldId) => {
        const val = answers[fieldId];
        if (val !== undefined && val !== null && val !== '') {
          if (Array.isArray(val)) {
            val.forEach((item) => {
              categoricalStats[fieldId].counts[item] = (categoricalStats[fieldId].counts[item] || 0) + 1;
            });
          } else {
            const strVal = String(val);
            categoricalStats[fieldId].counts[strVal] = (categoricalStats[fieldId].counts[strVal] || 0) + 1;
          }
        }
      });

      // Rating calculations
      Object.keys(ratingStats).forEach((fieldId) => {
        const val = Number(answers[fieldId]);
        if (!isNaN(val) && val >= 1 && val <= 5) {
          if (!ratingAccumulator[fieldId]) {
            ratingAccumulator[fieldId] = { sum: 0, count: 0 };
          }
          ratingAccumulator[fieldId].sum += val;
          ratingAccumulator[fieldId].count += 1;
          const starStr = String(Math.round(val));
          if (ratingStats[fieldId].distribution[starStr] !== undefined) {
            ratingStats[fieldId].distribution[starStr] += 1;
          }
        }
      });
    });

    Object.keys(ratingAccumulator).forEach((fieldId) => {
      if (ratingAccumulator[fieldId].count > 0) {
        ratingStats[fieldId].avg = Number((ratingAccumulator[fieldId].sum / ratingAccumulator[fieldId].count).toFixed(1));
        ratingStats[fieldId].total = ratingAccumulator[fieldId].count;
      }
    });

    // 3. Location, Timezone, and Device analytics
    const countryCounts: { [country: string]: number } = {};
    const timezoneCounts: { [tz: string]: number } = {};
    const deviceCounts: { [device: string]: number } = { Mobile: 0, Desktop: 0 };

    submissions.forEach((s) => {
      const meta = s.metadata || {};
      const country = meta.country || 'Unknown';
      countryCounts[country] = (countryCounts[country] || 0) + 1;

      const tz = meta.timezone || 'UTC';
      timezoneCounts[tz] = (timezoneCounts[tz] || 0) + 1;

      const dev = meta.device === 'Mobile' ? 'Mobile' : 'Desktop';
      deviceCounts[dev] = (deviceCounts[dev] || 0) + 1;
    });

    const topCountries = Object.entries(countryCounts)
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const topTimezones = Object.entries(timezoneCounts)
      .map(([timezone, count]) => ({ timezone, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    return res.json({
      total_submissions: totalCount,
      time_series: timeSeries,
      categorical_stats: categoricalStats,
      rating_stats: ratingStats,
      top_countries: topCountries,
      top_timezones: topTimezones,
      device_counts: deviceCounts,
      new_count: submissions.filter((s) => s.status === 'new').length,
      reviewed_count: submissions.filter((s) => s.status === 'reviewed').length,
    });
  })
);

/**
 * POST /api/v1/workspaces/:wsId/forms/:formId/ai-insights
 * Generate qualitative AI analysis and sentiment summary using Gemini.
 */
router.post(
  '/workspaces/:wsId/forms/:formId/ai-insights',
  authenticateAgency,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { wsId, formId } = req.params;
    await assertWorkspaceBelongsToAgency(wsId, req.agencyId!);

    // Fetch form and recent submissions
    const formRes = await query(
      `SELECT title, description, fields FROM forms WHERE id = $1 AND client_workspace_id = $2`,
      [formId, wsId]
    );

    if (formRes.rows.length === 0) {
      return res.status(404).json({ error: 'Form not found' });
    }

    const form = formRes.rows[0];

    const subsRes = await query(
      `SELECT answers, metadata, created_at FROM form_submissions WHERE form_id = $1 AND client_workspace_id = $2 ORDER BY created_at DESC LIMIT 50`,
      [formId, wsId]
    );

    if (subsRes.rows.length === 0) {
      return res.status(400).json({ error: 'No submissions recorded yet to analyze' });
    }

    if (!GEMINI_API_KEY || GEMINI_API_KEY.startsWith('replace_this')) {
      return res.json({
        summary: `Analyzed ${subsRes.rows.length} responses for "${form.title}". Respondents are actively engaged with clear intent.`,
        sentiment: 'Positive (88%)',
        key_themes: [
          'High demand for rapid onboarding and responsive communication',
          'Interest in custom automation and tailored workflows',
          'Satisfaction with user experience and prompt responses'
        ],
        recommendations: [
          'Follow up with respondents within 24 hours of submission',
          'Add a calendar booking link to the thank-you screen for instant scheduling'
        ]
      });
    }

    try {
      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

      const prompt = `Analyze these ${subsRes.rows.length} form submissions for the form: "${form.title}".
Form fields: ${JSON.stringify(form.fields)}
Submissions Sample Data: ${JSON.stringify(subsRes.rows.map((r) => r.answers))}

Provide a qualitative synthesis in strictly valid JSON with no markdown backticks, with this format:
{
  "summary": "2-3 sentence executive summary of the submissions",
  "sentiment": "e.g. 85% Positive / Neutral / Mixed",
  "key_themes": ["Theme 1", "Theme 2", "Theme 3"],
  "recommendations": ["Recommendation 1", "Recommendation 2"]
}`;

      const aiResponse = await model.generateContent(prompt);
      const rawText = aiResponse.response.text();
      const cleanedJson = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanedJson);

      return res.json(parsed);
    } catch (err: any) {
      console.error('[AI FORM INSIGHTS ERROR]:', err);
      return res.status(500).json({ error: 'Failed to analyze responses: ' + err.message });
    }
  })
);

export default router;
