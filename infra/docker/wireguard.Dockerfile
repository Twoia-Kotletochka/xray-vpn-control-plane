FROM alpine:3.21

RUN apk add --no-cache bash coreutils iproute2 iptables wireguard-tools

COPY infra/wireguard/run.sh /usr/local/bin/run-wireguard.sh

RUN chmod +x /usr/local/bin/run-wireguard.sh

ENTRYPOINT ["/usr/local/bin/run-wireguard.sh"]
