
undefined4 __thiscall FUN_0040fe3d(void *this,void *param_1)

{
  short *pData;
  short sVar1;
  bool bVar2;
  int iVar3;
  undefined4 uVar4;
  short *local_c;
  
  local_c = (short *)((int)param_1 + 6);
  bVar2 = false;
  if (*(int *)((int)this + 0x20) != 0) {
    FUN_00481020(*(undefined **)((int)this + 0x20));
  }
  *(undefined4 *)((int)this + 0x34) = 0;
  iVar3 = _memcmp(param_1,&DAT_0048b348,4);
  if (((iVar3 == 0) && (*(char *)((int)param_1 + 4) < '\x02')) &&
     ((*(char *)((int)param_1 + 4) != '\x01' || (*(char *)((int)param_1 + 5) < '\x03')))) {
    *(undefined4 *)((int)this + 0x30) = 6;
    if ((*(char *)((int)param_1 + 4) < '\x02') && (*(char *)((int)param_1 + 5) < '\x01')) {
      iVar3 = 0x10;
    }
    else {
      while (!bVar2) {
        sVar1 = *local_c;
        pData = local_c + 2;
        local_c = (short *)((uint)(ushort)local_c[1] + (int)pData);
        if (sVar1 == 0) {
          bVar2 = true;
        }
        else if (sVar1 == 1) {
          if (DAT_00492f88 != (HCONV)0x0) {
            iVar3 = lstrlenA((LPCSTR)pData);
            DdeClientTransaction
                      ((LPBYTE)pData,iVar3 + 1,DAT_00492f88,(HSZ)0x0,0,0x4050,0xffffffff,
                       (LPDWORD)0x0);
          }
          *(undefined4 *)((int)this + 0x34) = 1;
        }
      }
      iVar3 = (int)local_c - (int)param_1;
    }
    *(int *)((int)this + 0x30) = iVar3;
    *(void **)((int)this + 0x20) = param_1;
    iVar3 = FUN_0040fb5b((int)this);
    *(int *)((int)this + 0xc) = iVar3 + *(int *)((int)this + 0x20) + *(int *)((int)this + 8);
    uVar4 = 1;
    *(undefined4 *)((int)this + 0x28) = 1;
  }
  else {
    uVar4 = 0;
  }
  return uVar4;
}

