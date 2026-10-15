"""
Gera os PNGs do ícone sem depender de biblioteca de imagem (não tem PIL aqui).
Desenha em coordenadas normalizadas e faz antialiasing por supersampling.

Rode de novo só se mudar o desenho:  python3 gerar-icones.py
"""
import struct
import zlib

AZUL = (0x13, 0x7f, 0xec)
BRANCO = (0xff, 0xff, 0xff)
SUPERSAMPLE = 4

MARGEM, RAIO = 0.03, 0.24
INSET, BRACO, ESPESSURA = 0.25, 0.23, 0.10


def no_retangulo_arredondado(x, y, x0, y0, x1, y1, r):
    """Ponto mais próximo do retângulo interno; dentro do raio = dentro da forma."""
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def no_retangulo(x, y, x0, y0, x1, y1):
    return x0 <= x <= x1 and y0 <= y <= y1


def nas_marcas_de_corte(x, y):
    """Dois cantos opostos em L — leitura de 'recorte' mesmo a 16px."""
    i, a, t = INSET, BRACO, ESPESSURA
    return (
        no_retangulo(x, y, i, i, i + a, i + t)
        or no_retangulo(x, y, i, i, i + t, i + a)
        or no_retangulo(x, y, 1 - i - a, 1 - i - t, 1 - i, 1 - i)
        or no_retangulo(x, y, 1 - i - t, 1 - i - a, 1 - i, 1 - i)
    )


def pixel(px, py, lado):
    """Cor média do pixel, amostrando SUPERSAMPLE² subpontos."""
    fundo = glifo = 0
    for sy in range(SUPERSAMPLE):
        for sx in range(SUPERSAMPLE):
            x = (px + (sx + 0.5) / SUPERSAMPLE) / lado
            y = (py + (sy + 0.5) / SUPERSAMPLE) / lado
            if not no_retangulo_arredondado(x, y, MARGEM, MARGEM, 1 - MARGEM, 1 - MARGEM, RAIO):
                continue
            fundo += 1
            if nas_marcas_de_corte(x, y):
                glifo += 1

    total = SUPERSAMPLE ** 2
    if fundo == 0:
        return (0, 0, 0, 0)
    peso = glifo / fundo
    cor = tuple(round(AZUL[c] * (1 - peso) + BRANCO[c] * peso) for c in range(3))
    return (*cor, round(255 * fundo / total))


def escrever_png(caminho, lado):
    linhas = bytearray()
    for py in range(lado):
        linhas.append(0)  # filtro 0 (None) por linha
        for px in range(lado):
            linhas.extend(pixel(px, py, lado))

    def bloco(tipo, dados):
        return (struct.pack('>I', len(dados)) + tipo + dados
                + struct.pack('>I', zlib.crc32(tipo + dados) & 0xffffffff))

    png = (b'\x89PNG\r\n\x1a\n'
           + bloco(b'IHDR', struct.pack('>IIBBBBB', lado, lado, 8, 6, 0, 0, 0))
           + bloco(b'IDAT', zlib.compress(bytes(linhas), 9))
           + bloco(b'IEND', b''))

    with open(caminho, 'wb') as arquivo:
        arquivo.write(png)
    print(f'{caminho} ({len(png)} bytes)')


for lado in (16, 48, 128):
    escrever_png(f'icone-{lado}.png', lado)
