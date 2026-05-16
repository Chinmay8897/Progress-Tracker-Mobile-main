# Uptime Monitoring & Cold-Start Setup

The backend of TaskCommand is configured to survive cold-starts (like Render's free-tier sleep mechanism). 
The frontend gracefully handles timeouts using an exponential backoff system and displays a sleek `ColdStartOverlay` until the backend is fully awake.

While this recovery system prevents hard failures, you can largely avoid cold starts entirely by utilizing an external Uptime Monitor.

## Recommended Services
We recommend using lightweight uptime checkers such as:
- **UptimeRobot** (Free tier)
- **Better Stack** (Free tier)
- **Cron-job.org** (Free tier)

## Configuration Instructions

To set up your monitor, follow these parameters:

1. **Endpoint URL:** `https://your-backend.onrender.com/api/health`
2. **HTTP Method:** `GET`
3. **Ping Interval:** **10 to 15 minutes** (Do not set to 1 minute!)
4. **Expected Status:** HTTP 200

### Important: Why Aggressive Pinging Should Not Be Used
You should configure the ping interval to **no less than 10-14 minutes** instead of aggressive 1-minute loops. 

**Why?**
1. Render's free tier policy specifically targets and penalizes applications that use abusive 1-minute ping loops. Doing so may result in your account or web service being temporarily suspended.
2. Free tier services have an allocation of "free hours" per month. Pinging every minute will permanently exhaust your free active hours globally for your account.
3. Our `GET /api/health` route is uniquely placed at the absolute top of the middleware stack (before JSON parsers or rate-limiters) and executes zero Database queries. This ultra-lightweight ping operates completely beneath the radar when pinged responsibly (every 14 minutes), satisfying Render's limits while keeping the instance hot.

If the instance *does* manage to sleep, our frontend recovery architecture guarantees a flawless experience for the user by catching the network drop, automatically retrying using exponential backoff, and masking the loading state professionally.
