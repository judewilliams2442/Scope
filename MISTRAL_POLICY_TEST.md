# Standalone Mistral privacy-policy test

This small command-line program sends a local UTF-8 text file to Mistral's chat-completions API and prints a concise analysis with supporting quotations. It does not modify or integrate with the Scope extension.

## API details

The program uses `POST https://api.mistral.ai/v1/chat/completions`, sends the API key as a Bearer token in the `Authorization` header, and defaults to `ministral-3b-latest`, a smaller model than Mistral Large. Mistral documents the chat-completions API and a models-list endpoint in its [API documentation](https://docs.mistral.ai/api/) and describes chat requests in the [chat-completion guide](https://docs.mistral.ai/inference/conversations/chat-completion). Model availability and pricing depend on your account; the program cannot guarantee that a model is enabled or free for your key.

## Requirements

- Python 3.9 or newer
- No third-party Python packages; it uses only the standard library
- A Mistral API key, entered locally in the `.env` file or provided through the `MISTRAL_API_KEY` environment variable

Do not put the API key in the script, policy file, or source control. The entire policy text is sent to Mistral, so only test with text you are authorized to share. If a key has been shared in chat or another public place, revoke it and create a new one.

## Set up the key and run from PowerShell

Open `.env` in a text editor and add your newly generated key after the equals sign:

```text
MISTRAL_API_KEY=your-new-api-key
```

`.env` is ignored by Git and the script reads it automatically. Alternatively, set the environment variable directly:

```powershell
$env:MISTRAL_API_KEY = "your-new-api-key"
```

Then run the test:

```powershell
python .\mistral_policy_test.py .\policy.txt
```

To see model identifiers returned for your API key, without sending the policy:

```powershell
python .\mistral_policy_test.py --list-models
```

If a model is listed but still returns HTTP 403, choose another listed model and pass it with `--model`:

```powershell
python .\mistral_policy_test.py .\policy.txt --model MODEL_ID_FROM_THE_LIST
```

In Command Prompt:

```bat
set MISTRAL_API_KEY=your-new-api-key
python mistral_policy_test.py policy.txt
```

The policy file must be UTF-8 text. The program sends the entire file without client-side truncation. If Mistral rejects it for exceeding the model context, the program reports that instead of shortening it. It also prints elapsed request time, policy and response sizes, and any usage/token details returned by the API.

Optional arguments:

```powershell
python .\mistral_policy_test.py .\policy.txt --model ministral-3b-latest --timeout 180
```

The program reports authentication failures, denied access, unavailable models, context-length errors, rate limits, and network failures with specific messages.
