# Custom Mosquitto image.
#
# The upstream image only reloads password_file/acl_file on SIGHUP, and the
# broker runs isolated in its own container (no external process can signal
# it without mounting the Docker socket). This image adds a small watcher
# (see entrypoint.sh) that reloads the broker automatically when the auth
# files change, so provisioning works without granting the backend access to
# the Docker daemon.
FROM eclipse-mosquitto:2

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
CMD ["/usr/sbin/mosquitto", "-c", "/mosquitto/config/mosquitto.conf"]
