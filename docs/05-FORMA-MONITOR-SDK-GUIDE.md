# Forma Monitor SDK — Integration Guide

A lightweight, zero-dependency error tracking and crash reporting SDK for Web, Electron (Desktop), and Node.js.

---

## 1. Quick Start: Web Application

### Option A: HTML Script Tag (Simplest)
Add this to the `<head>` or `<body>` of your HTML page:

```html
<script 
  src="http://YOUR_FORMA_API_DOMAIN/forma-monitor.js" 
  data-agent-id="YOUR_AGENT_UUID"
  data-agent-key="fa_live_YOUR_API_KEY">
</script>
```

### Option B: JavaScript / TypeScript (React, Next.js, Vue)
Include the script and initialize programmatically:

```typescript
import FormaMonitor from './forma-monitor.js'; // or load via CDN/script

FormaMonitor.init({
  endpoint: 'http://localhost:5000',
  agentId: 'YOUR_AGENT_UUID',
  apiKey: 'fa_live_YOUR_API_KEY',
  appName: 'Customer Portal',
  appVersion: '1.2.0',
  environment: 'production'
});
```

---

## 2. Quick Start: Electron Desktop App

Electron applications have two processes: **Renderer (UI)** and **Main (Node.js)**. Forma Monitor handles both!

### In the Renderer Process (`index.html` or UI frontend):
```html
<!-- Inside index.html -->
<script 
  src="http://localhost:5000/forma-monitor.js" 
  data-agent-id="YOUR_AGENT_UUID"
  data-agent-key="fa_live_YOUR_API_KEY">
</script>
```

### In the Main Process (`main.js` / `main.ts`):
```javascript
const FormaMonitor = require('./forma-monitor.js'); // or fetch/bundle

FormaMonitor.init({
  endpoint: 'http://localhost:5000',
  agentId: 'YOUR_AGENT_UUID',
  apiKey: 'fa_live_YOUR_API_KEY',
  appName: 'My Desktop App',
  appVersion: require('./package.json').version,
  environment: 'production'
});

// All unhandled exceptions in the Node main process will now be captured automatically!
```

---

## 3. Quick Start: Flutter (Mobile & Desktop)

In your Flutter app's `main.dart`, wrap error dispatchers with an HTTP POST to Forma:

```dart
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

const String formaEndpoint = 'http://YOUR_SERVER_IP:5000/api/v1/agents/YOUR_AGENT_UUID/telemetry/crash';
const String formaApiKey = 'fa_live_YOUR_API_KEY';

void reportFlutterError(dynamic error, StackTrace? stack) async {
  try {
    await http.post(
      Uri.parse(formaEndpoint),
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Key': formaApiKey,
      },
      body: jsonEncode({
        'message': error.toString(),
        'source_file': 'flutter_main.dart',
        'line_number': 0,
        'error_trace': stack?.toString() ?? error.toString(),
        'user_context': {
          'runtime': 'flutter',
          'platform': 'mobile/desktop',
        }
      }),
    );
  } catch (_) {}
}

void main() {
  FlutterError.onError = (FlutterErrorDetails details) {
    FlutterError.presentError(details);
    reportFlutterError(details.exception, details.stack);
  };

  runApp(const MyApp());
}
```

---

## 4. Manual Exception Capture & Breadcrumbs

You can also manually track handled exceptions or add custom user journey steps:

```javascript
// Add custom breadcrumbs before critical operations
FormaMonitor.addBreadcrumb('checkout', 'User clicked proceed to payment');

try {
  dangerousOperation();
} catch (err) {
  // Manually send to Forma AI
  FormaMonitor.captureException(err);
}
```

---

## 5. What Happens When an Error is Reported?

1. **Ingestion & De-duplication:** Forma AI checks if this exact error was reported in the last 15 minutes.
2. **AI Diagnosis (Gemini):** Gemini analyzes the stack trace and the source file.
3. **Software Factory Fix:** Forma AI generates an automated unit test and a surgical code patch.
4. **GitHub Pull Request:** A ready-to-merge PR is created on the configured GitHub repository!
