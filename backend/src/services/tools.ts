import { query } from '../config/db';
import nodemailer from 'nodemailer';

export interface ToolContext {
  agentId: string;
  toolConfig?: Record<string, any>;
}

export interface ToolResult {
  success: boolean;
  data?: Record<string, any>;
  error?: string;
}

/**
 * Core execution coordinator for agent tools.
 * Runs the requested tool handler (cal.com integrations & nodemailer SMTP), 
 * logs the execution to the action_logs table, and returns the result.
 */
export async function executeTool(
  toolName: string,
  input: Record<string, any>,
  context: ToolContext
): Promise<ToolResult> {
  const { agentId, toolConfig = {} } = context;
  console.log(`[TOOL SERVICE] Executing tool: ${toolName} with parameters:`, input);

  try {
    let resultData: Record<string, any> = {};
    
    if (toolName === 'book_calendar_slot') {
      const { date, time, attendee_email } = input;
      if (!date || !time || !attendee_email) {
        throw new Error('date, time, and attendee_email are required parameters');
      }

      // 1. Resolve Cal.com configuration (check DB toolConfig overrides first, then environment)
      const calApiKey = toolConfig.cal_api_key || process.env.CAL_API_KEY;
      const eventTypeId = toolConfig.cal_event_type_id || process.env.CAL_EVENT_TYPE_ID;

      if (calApiKey && calApiKey.trim() !== '' && eventTypeId) {
        console.log(`[TOOL SERVICE] Dispatching real booking request to Cal.com API...`);
        
        // Calculate start/end datetimes (assuming 30 minute standard slot duration)
        const startStr = `${date}T${time}:00`;
        const startDate = new Date(startStr);
        const endDate = new Date(startDate.getTime() + 30 * 60 * 1000);

        const calRes = await fetch(`https://api.cal.com/v1/bookings?apiKey=${calApiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            eventTypeId: Number(eventTypeId),
            start: startDate.toISOString(),
            end: endDate.toISOString(),
            responses: {
              name: 'Forma AI Customer',
              email: attendee_email
            },
            timeZone: 'UTC'
          })
        });

        if (!calRes.ok) {
          const errMsg = await calRes.text();
          throw new Error(`Cal.com Booking Failed: ${calRes.statusText} (${errMsg})`);
        }

        const bookingData = (await calRes.json()) as any;
        console.log(`[TOOL SERVICE] Cal.com Booking confirmed successfully.`);
        resultData = {
          booking_id: bookingData.booking?.id || `cal_${Date.now()}`,
          status: 'confirmed',
          date,
          time,
          attendee_email,
          meeting_link: bookingData.booking?.videoCallData?.url || 'https://meet.google.com/fa-meeting'
        };
      } else {
        // Fallback to mock scheduler in development/local setups
        console.log(`[TOOL SERVICE] No Cal.com credentials found. Simulating calendar booking fallback...`);
        resultData = {
          booking_id: `fa_cal_${Math.random().toString(36).substring(2, 10)}`,
          status: 'confirmed',
          date,
          time,
          attendee_email,
          meeting_link: 'https://meet.google.com/fa-mock-meeting-link'
        };
      }
      
    } else if (toolName === 'create_support_ticket') {
      const { subject, description } = input;
      if (!subject || !description) {
        throw new Error('subject and description are required parameters');
      }
      
      // 1. Insert row into tickets table
      const ticketResult = await query(
        `INSERT INTO tickets (agent_id, subject, description, status)
         VALUES ($1, $2, $3, 'open')
         RETURNING id, subject, status, created_at`,
        [agentId, subject, description]
      );
      
      const ticket = ticketResult.rows[0];
      console.log(`[TOOL SERVICE] Support ticket logged in DB: ${ticket.id}`);

      // 2. Dispatch alert email notification using Nodemailer SMTP
      const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, AGENCY_ALERT_EMAIL } = process.env;
      
      if (SMTP_HOST && SMTP_USER && SMTP_PASS && AGENCY_ALERT_EMAIL) {
        console.log(`[TOOL SERVICE] Dispatching support ticket alert email to ${AGENCY_ALERT_EMAIL} via SMTP...`);
        try {
          const transporter = nodemailer.createTransport({
            host: SMTP_HOST,
            port: Number(SMTP_PORT || 587),
            secure: SMTP_PORT === '465',
            auth: {
              user: SMTP_USER,
              pass: SMTP_PASS
            }
          });

          await transporter.sendMail({
            from: `"Forma AI Agent" <${SMTP_USER}>`,
            to: AGENCY_ALERT_EMAIL,
            subject: `[TICKET ALERT] Support Ticket #${ticket.id} Opened`,
            text: `A new support ticket has been filed by the support agent.\n\nTicket Details:\nID: ${ticket.id}\nSubject: ${subject}\nDescription: ${description}\nCreated At: ${ticket.created_at}\n\nPlease check the dashboard to resolve this escalation.`
          });
          console.log('[TOOL SERVICE] SMTP Ticket notification email dispatched.');
        } catch (mailErr: any) {
          console.error('[TOOL SERVICE] Email alert dispatch failed, proceeding gracefully. Error:', mailErr.message);
        }
      } else {
        console.log('[TOOL SERVICE] SMTP credentials or AGENCY_ALERT_EMAIL not configured. Email dispatch skipped.');
      }
      
      resultData = {
        ticket_id: ticket.id,
        subject: ticket.subject,
        status: ticket.status,
        created_at: ticket.created_at,
        message: 'Support ticket successfully logged, and email notification processed.'
      };
      
    } else {
      throw new Error(`Unsupported tool name: ${toolName}`);
    }

    // Save successful execution row to action_logs
    await query(
      `INSERT INTO action_logs (agent_id, action_type, action_input, action_result, status)
       VALUES ($1, $2, $3, $4, 'success')`,
      [agentId, toolName, JSON.stringify(input), JSON.stringify(resultData)]
    );

    return { success: true, data: resultData };
  } catch (err: any) {
    console.error(`[TOOL SERVICE] Tool execution failed for ${toolName}. Error:`, err.message);
    
    // Save failed execution row to action_logs
    await query(
      `INSERT INTO action_logs (agent_id, action_type, action_input, action_result, status)
       VALUES ($1, $2, $3, $4, 'failed')`,
      [agentId, toolName, JSON.stringify(input), JSON.stringify({ error: err.message })]
    );

    return { success: false, error: err.message };
  }
}
