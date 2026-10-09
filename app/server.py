import html
import json
import random
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import URLError
from urllib.parse import parse_qs, urlsplit
from urllib.request import urlopen


WEB_DIR = Path(__file__).resolve().parents[1] / "web"
TRIVIA_CATEGORIES = set(range(9, 33))


class QuizRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB_DIR), **kwargs)

    def do_GET(self):
        if urlsplit(self.path).path != "/api/questions":
            return super().do_GET()

        query = parse_qs(urlsplit(self.path).query)
        try:
            amount = min(max(int(query.get("amount", ["10"])[0]), 1), 30)
            category_value = query.get("category", [""])[0]
            category = int(category_value) if category_value else None
            if category is not None and category not in TRIVIA_CATEGORIES:
                self.send_json(400, {"error": "Choose a valid trivia topic."})
                return

            url = f"https://opentdb.com/api.php?amount={amount}&type=multiple"
            if category is not None:
                url += f"&category={category}"
            with urlopen(url, timeout=12) as response:
                payload = json.loads(response.read().decode("utf-8"))

            if payload.get("response_code") != 0 or not payload.get("results"):
                self.send_json(502, {"error": "The trivia service returned no questions."})
                return

            questions = []
            for item in payload["results"]:
                options = [html.unescape(value) for value in item["incorrect_answers"]]
                correct_answer = html.unescape(item["correct_answer"])
                random.shuffle(options)
                answer_index = random.randrange(len(options) + 1)
                options.insert(answer_index, correct_answer)
                questions.append(
                    {
                        "prompt": html.unescape(item["question"]),
                        "options": options,
                        "answer": answer_index,
                    }
                )

            self.send_json(200, {"questions": questions})
        except (URLError, TimeoutError, ValueError, KeyError, json.JSONDecodeError) as error:
            self.send_json(502, {"error": f"Could not fetch questions: {error}"})

    def send_json(self, status, data):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


def run():
    address = ("127.0.0.1", 8000)
    server = ThreadingHTTPServer(address, QuizRequestHandler)
    print(f"Quick Quiz is running at http://{address[0]}:{address[1]}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping Quick Quiz.")
    finally:
        server.server_close()


if __name__ == "__main__":
    run()
