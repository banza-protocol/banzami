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

func (t *smtpTransport) send(m message) error {
	headers := []string{
		fmt.Sprintf("From: %s <%s>", m.fromName, m.fromAddr),
		fmt.Sprintf("To: %s", m.to),
		fmt.Sprintf("Subject: %s", m.subject),
	}
	if m.replyTo != "" {
		headers = append(headers, fmt.Sprintf("Reply-To: %s", m.replyTo))
	}
	headers = append(headers,
		"MIME-Version: 1.0",
		`Content-Type: text/html; charset="UTF-8"`,
		"",
		m.html,
	)
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
		if err := client.Mail(m.fromAddr); err != nil {
			return err
		}
		if err := client.Rcpt(m.to); err != nil {
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

	return smtp.SendMail(addr, auth, m.fromAddr, []string{m.to}, []byte(msg))
}
