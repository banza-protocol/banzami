package email

import (
	"crypto/tls"
	"fmt"
	"net/smtp"
	"strings"
)

// smtpTransport delivers email over SMTP (stdlib net/smtp). It is the legacy
// fallback used when EMAIL_PROVIDER != "resend".
type smtpTransport struct {
	host     string
	port     int
	user     string
	password string
}

func (t *smtpTransport) configured() bool {
	return t.host != ""
}

func (t *smtpTransport) send(m Message) error {
	headers := []string{
		fmt.Sprintf("From: %s <%s>", m.FromName, m.FromAddr),
		fmt.Sprintf("To: %s", m.To),
		fmt.Sprintf("Subject: %s", m.Subject),
	}
	if m.ReplyTo != "" {
		headers = append(headers, fmt.Sprintf("Reply-To: %s", m.ReplyTo))
	}
	headers = append(headers, "MIME-Version: 1.0")

	if m.Text != "" {
		// multipart/alternative: plain-text first, then HTML.
		const boundary = "bz-alt-boundary-9f3a"
		headers = append(headers,
			`Content-Type: multipart/alternative; boundary="`+boundary+`"`,
			"",
			"--"+boundary,
			`Content-Type: text/plain; charset="UTF-8"`,
			"",
			m.Text,
			"",
			"--"+boundary,
			`Content-Type: text/html; charset="UTF-8"`,
			"",
			m.HTML,
			"",
			"--"+boundary+"--",
		)
	} else {
		headers = append(headers,
			`Content-Type: text/html; charset="UTF-8"`,
			"",
			m.HTML,
		)
	}
	msg := strings.Join(headers, "\r\n")

	addr := fmt.Sprintf("%s:%d", t.host, t.port)
	auth := smtp.PlainAuth("", t.user, t.password, t.host)

	// Implicit TLS on 465; STARTTLS (stdlib auto) on 587; plain on 25.
	if t.port == 465 {
		tlsCfg := &tls.Config{ServerName: t.host}
		conn, err := tls.Dial("tcp", addr, tlsCfg)
		if err != nil {
			return fmt.Errorf("tls dial: %w", err)
		}
		client, err := smtp.NewClient(conn, t.host)
		if err != nil {
			return fmt.Errorf("smtp client: %w", err)
		}
		defer client.Close()
		if err := client.Auth(auth); err != nil {
			return fmt.Errorf("smtp auth: %w", err)
		}
		if err := client.Mail(m.FromAddr); err != nil {
			return err
		}
		if err := client.Rcpt(m.To); err != nil {
			return err
		}
		w, err := client.Data()
		if err != nil {
			return err
		}
		if _, err = w.Write([]byte(msg)); err != nil {
			return err
		}
		return w.Close()
	}

	return smtp.SendMail(addr, auth, m.FromAddr, []string{m.To}, []byte(msg))
}
