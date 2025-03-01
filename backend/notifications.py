import smtplib
import requests

def send_telegram(message):
    token = '8175749575:AAGWrWMrqzQkDP8bkKe3gafC42r_Ridr0gY'
    chat_id = '8175749575'
    url = f'https://api.telegram.org/bot{token}/sendMessage'
    data = {'chat_id': chat_id, 'text': message}
    requests.post(url, data=data)

def send_whatsapp(message):
    # Placeholder for WhatsApp API integration (e.g., Twilio)
    pass

def send_email(message):
    smtp_server = 'smtp.example.com'
    smtp_port = 587
    username = 'your_email@example.com'
    password = 'your_password'
    from_addr = 'your_email@example.com'
    to_addr = 'recipient@example.com'
    subject = 'Stream Alert'
    email_message = f"Subject: {subject}\n\n{message}"
    
    server = smtplib.SMTP(smtp_server, smtp_port)
    server.starttls()
    server.login(username, password)
    server.sendmail(from_addr, to_addr, email_message)
    server.quit()

def send_notification(message):
    send_telegram(message)
    send_whatsapp(message)
    send_email(message)

if __name__ == "__main__":
    test_message = "Test: Hello from your Telegram bot!"
    result = send_test_telegram_message(test_message)
    print("Telegram API Response:", result)
