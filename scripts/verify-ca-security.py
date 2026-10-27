"""Verify public HTTPS and rejection of compromised CAs in the deployed runtime."""

import ssl
import urllib.error
import urllib.request
from importlib.metadata import version

import certifi


def check(context, label):
    with urllib.request.urlopen("https://pypi.org/", context=context, timeout=30):
        print(f"{label}: public HTTPS works")
    for host in (
        "dv-g3b-emudhra.we-have-a-problem.com",
        "dv-g3b-aaa-emudhra.we-have-a-problem.com",
    ):
        try:
            urllib.request.urlopen(f"https://{host}/", context=context, timeout=30)
        except urllib.error.URLError as error:
            if not isinstance(error.reason, ssl.SSLCertVerificationError):
                raise
            print(f"{label}: {host} rejected ({error.reason.verify_message})")
        else:
            raise RuntimeError(f"{label} still trusts {host}")


if __name__ == "__main__":
    installed = version("certifi")
    if tuple(map(int, installed.split("."))) < (2026, 10, 19):
        raise RuntimeError(f"Outdated certifi: {installed}")
    print(f"certifi {installed}; {ssl.OPENSSL_VERSION}")
    check(ssl.create_default_context(), "system CA store")
    check(ssl.create_default_context(cafile=certifi.where()), "certifi CA store")
